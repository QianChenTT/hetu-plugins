# hetu-plugins

Plugins for [hetu](https://github.com/QianChenTT/hetu), a local notes app that runs each plugin isolated and gives it only the capabilities its manifest asks for

- Each plugin is one folder at the root, named by its id, with its `hetu-plugin.json` manifest, its source and its tests
- The plugins are built and tested against hetu at a pinned commit, so a change in hetu reaches them only when the pin moves
