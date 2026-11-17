import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import http from 'node:http'

const resourceCookie = 'fixture_resource=fixture-only'
const setCookie = `${resourceCookie}; Path=/api/v1/mediaserver/; HttpOnly; Secure; SameSite=Lax`

/** 启动只接收合成媒体请求的回环上游，允许测试在首块已到达后释放末块。 */
export async function startMediaUpstream(t) {
  const requests = []
  let releaseResponse
  const upstream = http.createServer(async (req, res) => {
    requests.push({ url: req.url, headers: req.headers })
    if (req.url === '/api/v1/mediaserver/stream-info?itemid=fixture-only') {
      const origin = `${req.headers['x-forwarded-proto']}://${req.headers.host}`
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': setCookie })
      res.end(
        JSON.stringify({
          content_url: `${origin}/api/v1/mediaserver/stream?itemid=fixture-only`,
          subtitle_url: `${origin}/api/v1/mediaserver/stream-subtitle?itemid=fixture-only&subtitle_id=fixture.srt`,
          lyrics_url: `${origin}/api/v1/mediaserver/stream-lyrics?itemid=fixture-only`,
        }),
      )
      return
    }
    if (req.url === '/api/v1/mediaserver/stream?itemid=fixture-only') {
      const gate = new Promise(resolve => {
        releaseResponse = resolve
      })
      res.writeHead(206, {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Range': 'bytes 2-7/10',
        'Content-Length': '6',
      })
      res.write('234')
      await gate
      res.end('567')
      return
    }
    res.writeHead(404)
    res.end()
  })
  t.after(async () => {
    releaseResponse?.()
    upstream.closeAllConnections()
    await new Promise(resolve => upstream.close(resolve))
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  return {
    url: `http://127.0.0.1:${upstream.address().port}`,
    requests,
    releaseResponse: () => releaseResponse(),
  }
}

/** 通过真实 HTTP 请求确认代理保留域名、端口和 IPv6 来源以及媒体认证与分块传输。 */
export async function verifyMediaProxy(base, upstream) {
  for (const host of ['moviepilot.example', 'moviepilot.example:8443', '[2001:db8::1]:8443']) {
    const headers = { Host: host, 'X-Forwarded-Proto': 'https', Cookie: resourceCookie }
    const manifest = await new Promise((resolve, reject) => {
      http
        .get(`${base}/api/v1/mediaserver/stream-info?itemid=fixture-only`, { headers }, response => {
          const chunks = []
          response.on('data', chunk => chunks.push(chunk))
          response.on('end', () => resolve({ response, body: Buffer.concat(chunks).toString() }))
          response.on('error', reject)
        })
        .on('error', reject)
    })
    assert.equal(manifest.response.statusCode, 200)
    assert.deepEqual(manifest.response.headers['set-cookie'], [setCookie])
    const manifestBody = JSON.parse(manifest.body)
    assert.equal(manifestBody.content_url, `https://${host}/api/v1/mediaserver/stream?itemid=fixture-only`)
    assert.equal(
      manifestBody.subtitle_url,
      `https://${host}/api/v1/mediaserver/stream-subtitle?itemid=fixture-only&subtitle_id=fixture.srt`,
    )
    assert.equal(manifestBody.lyrics_url, `https://${host}/api/v1/mediaserver/stream-lyrics?itemid=fixture-only`)
    const media = await new Promise((resolve, reject) => {
      http
        .get(
          `${base}/api/v1/mediaserver/stream?itemid=fixture-only`,
          { headers: { ...headers, Range: 'bytes=2-7' } },
          response => {
            assert.equal(response.statusCode, 206)
            assert.equal(response.headers['content-range'], 'bytes 2-7/10')
            assert.equal(response.headers['accept-ranges'], 'bytes')
            assert.equal(response.headers['content-type'], 'video/mp4')
            assert.equal(response.headers['content-length'], '6')
            const chunks = []
            response.once('data', chunk => {
              // 上游末块仍被阻塞时就收到首块，防止代理把整段媒体缓存在内存中。
              assert.equal(chunk.toString(), '234')
              upstream.releaseResponse()
            })
            response.on('data', chunk => chunks.push(chunk))
            response.on('end', () => resolve(Buffer.concat(chunks).toString()))
            response.on('error', reject)
          },
        )
        .on('error', reject)
    })
    assert.equal(media, '234567')
    for (const request of upstream.requests.splice(0)) {
      assert.equal(request.headers.host, host)
      assert.equal(request.headers['x-forwarded-proto'], 'https')
      assert.equal(request.headers.cookie, resourceCookie)
      if (request.url.includes('/stream?')) assert.equal(request.headers.range, 'bytes=2-7')
    }
  }
}
