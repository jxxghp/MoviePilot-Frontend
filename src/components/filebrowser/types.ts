/** 文件详情、行菜单和移动操作面板共用的操作标识。 */
export type FileAction = 'recognize' | 'scrape' | 'rename' | 'reorganize' | 'download' | 'delete'

/** 文件列表的排序列：名称、大小、修改时间。 */
export type FileSortKey = 'name' | 'size' | 'time'

/** 文件列表的排序方向。 */
export type FileSortOrder = 'asc' | 'desc'
