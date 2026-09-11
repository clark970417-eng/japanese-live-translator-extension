/** Discovery must not import MLX: loading its native dependencies can exceed
 * the short availability timeout, especially during repeated restarts. */
export const MLX_MODULE_PROBE = 'import importlib.util, sys; sys.exit(0 if importlib.util.find_spec("mlx_whisper") is not None else 1)'
