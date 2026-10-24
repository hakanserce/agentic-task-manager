declare module 'virtual:atm-changelog' {
  const entries: import('./lib/changelog').ChangelogEntry[];
  export default entries;
}

declare module 'virtual:atm-plugin-info' {
  const info: import('./lib/plugin-info').PluginInfo;
  export default info;
}
