/** Bytes per mebibyte (MiB) */
export const BYTES_PER_MIB = 1024 * 1024
/** Bytes per gibibyte (GiB) */
export const BYTES_PER_GIB = 1024 * 1024 * 1024
/** Bytes per tebibyte (TiB) */
export const BYTES_PER_TIB = 1024 * BYTES_PER_GIB
/** Mebibytes per gibibyte — Gi → Mi conversion factor */
export const MIB_PER_GIB = 1024
/** Kibibytes per mebibyte — Ki → Mi conversion factor */
export const KIB_PER_MIB = 1024
/** Millicores per CPU core — Kubernetes represents CPU in millicores (1 core = 1000m) */
export const MILLICORES_PER_CORE = 1000
/** Decimal gigabyte → mebibyte conversion factor (1 GB = 10^9 bytes / 2^20) */
export const GB_TO_MIB = (1000 * 1000) / (1024 * 1024)
/** Decimal megabyte → mebibyte conversion factor (1 MB = 10^6 bytes / 2^20) */
export const MB_TO_MIB = (1000 * 1000) / (1024 * 1024)
