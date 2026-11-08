export default defineAppConfig({
  seo: {
    title: 'LogsTrace Docs',
    description: 'Send logs from any app, service or script. LogsTrace groups repeated messages into tables so you can filter, summarise and trace any value.'
  },
  header: {
    title: 'LogsTrace',
    logo: {
      light: '/logo-light.svg',
      dark: '/logo-dark.svg',
      alt: 'LogsTrace',
      favicon: '/favicon.svg'
    }
  },
  navigation: {
    sub: 'header'
  },
  socials: {},
  // The app repo is private: no GitHub button or "edit this page" links
  github: { url: '', owner: '', name: '' },
  toc: {
    title: 'On this page',
    bottom: {
      title: 'Links',
      links: [
        { icon: 'i-lucide-layout-dashboard', label: 'Open dashboard', to: 'https://logstrace.dev/app', target: '_blank' },
        { icon: 'i-lucide-shield', label: 'Report a security issue', to: 'https://logstrace.dev/.well-known/security.txt', target: '_blank' }
      ]
    }
  },
  ui: {
    colors: {
      primary: 'tide',
      neutral: 'moss'
    }
  }
})
