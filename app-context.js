import Registry from './lib/registry';

export default function() {
  this.runlevel('configured')
    .use('connie', 'file', 'config/${environment}.json');

  this.runlevel('connected')
    .use('access-mongo', '$mongodb');

  this.runlevel('initialized')
    .use((context) => context.registry = new Registry(context.mongodb));

  this.runlevel('running')
    .use('express');
}
