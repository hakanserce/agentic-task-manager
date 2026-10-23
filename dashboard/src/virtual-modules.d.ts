declare module 'virtual:atm-changelog' {
  const entries: import('./lib/changelog').ChangelogEntry[];
  export default entries;
}
