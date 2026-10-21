/** 16 × 16 线性图标集：统一 stroke=currentColor，路径保持简洁。 */
export const ICON_PATHS = {
  plus: '<path d="M8 3.2v9.6M3.2 8h9.6"/>',
  menu: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7"/>',
  sliders:
    '<path d="M2.5 5h11M2.5 11h11"/><circle cx="6" cy="5" r="1.7" fill="var(--bg-raised)"/><circle cx="10" cy="11" r="1.7" fill="var(--bg-raised)"/>',
  sun: '<circle cx="8" cy="8" r="2.6"/><path d="M8 1.6v1.2M8 13.2v1.2M1.6 8h1.2M13.2 8h1.2M3.5 3.5l.9.9M11.6 11.6l.9.9M12.5 3.5l-.9.9M4.4 11.6l-.9.9"/>',
  moon: '<path d="M13.2 9.4A5.5 5.5 0 1 1 6.6 2.8a4.4 4.4 0 0 0 6.6 6.6z"/>',
  trash: '<path d="M3 4.3h10M6.5 4.3V3h3v1.3M4.3 4.3l.6 8.2h6.2l.6-8.2"/>',
  edit: '<path d="M11.3 2.4l2.3 2.3M12 1.7l2.3 2.3-8.2 8.2-3 .7.7-3z"/>',
  copy: '<rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1.4"/><path d="M10.5 5.5V3.6c0-.6-.5-1.1-1.1-1.1H3.6c-.6 0-1.1.5-1.1 1.1v5.8c0 .6.5 1.1 1.1 1.1h1.9"/>',
  refresh: '<path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.7M13.5 2.8v2.7h-2.7"/>',
  stop: '<rect x="4.5" y="4.5" width="7" height="7" rx="1.2"/>',
  send: '<path d="M13.5 8L2.8 3l1.9 5-1.9 5zM4.7 8h8.8"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  'chevron-down': '<path d="M4 6l4 4 4-4"/>',
  'chevron-left': '<path d="M10 4L6 8l4 4"/>',
  'chevron-right': '<path d="M6 4l4 4-4 4"/>',
  'arrow-down': '<path d="M8 3v10M4 9l4 4 4-4"/>',
  check: '<path d="M3 8.5l3.2 3.2L13 4.5"/>',
  alert: '<path d="M8 2.5l5.8 10.4H2.2z"/><path d="M8 6.5v3M8 11.2v.1"/>',
  'alert-circle': '<circle cx="8" cy="8" r="6"/><path d="M8 4.8v3.8M8 11.1v.1"/>',
  wrench:
    '<path d="M9.8 4.2a2.6 2.6 0 0 0-3.4 3.4L2.6 11.4a1.1 1.1 0 0 0 1.6 1.6l3.8-3.8a2.6 2.6 0 0 0 3.4-3.4l-1.7 1.7-1.7-.5-.5-1.7z"/>',
  eye: '<path d="M1.8 8s2.3-3.8 6.2-3.8S14.2 8 14.2 8s-2.3 3.8-6.2 3.8S1.8 8 1.8 8z"/><circle cx="8" cy="8" r="1.8"/>',
  'eye-off':
    '<path d="M2 2l12 12"/><path d="M6.6 4.4A6.8 6.8 0 0 1 8 4.2c3.9 0 6.2 3.8 6.2 3.8a11 11 0 0 1-2.1 2.4M4.1 5.6A10.7 10.7 0 0 0 1.8 8s2.3 3.8 6.2 3.8c.8 0 1.5-.2 2.2-.4"/>',
  thinking:
    '<path d="M8 2.8a5.2 5.2 0 0 1 3.9 8.6c-.6.7-.9 1.2-.9 2.1H5c0-.9-.3-1.4-.9-2.1A5.2 5.2 0 0 1 8 2.8z"/><path d="M6.2 14.2h3.6"/>',
  'panel-left': '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M6 3v10"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/>',
  settings:
    '<path d="M8 2.2v1.1M8 12.7v1.1M2.2 8h1.1M12.7 8h1.1M3.9 3.9l.8.8m6.6 6.6.8.8m0-8.2-.8.8m-6.6 6.6-.8.8"/><circle cx="8" cy="8" r="3"/>',
  'arrow-up': '<path d="M8 12.8V3.6M3.8 7.4L8 3.2l4.2 4.2"/>',
} as const

export type IconName = keyof typeof ICON_PATHS
