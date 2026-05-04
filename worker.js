const ANON_HOSTS = ['bipolaranonymous.app', 'www.bipolaranonymous.app'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '') {
      const target = new URL(url);
      target.pathname = ANON_HOSTS.includes(url.hostname)
        ? '/anonymous.html'
        : '/beta.html';
      return env.ASSETS.fetch(new Request(target.toString(), request));
    }

    return env.ASSETS.fetch(request);
  },
};
