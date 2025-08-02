default async function(api) {
  api.log('Hello from demo app.');
  const name = await api.input('Enter your name');
  api.log('Welcome, ' + name + '.');
  const cmd = await api.input('What do you want to do?');
  api.log('You said: ' + cmd);
}
