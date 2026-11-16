# hetu-plugins

Plugins for [hetu](https://github.com/QianChenTT/hetu), a local notes app that runs each plugin isolated and gives it only the capabilities its manifest asks for

- Each plugin is one folder at the root, named by its id, with its `hetu-plugin.json` manifest, its source and its tests
- The plugins are built and tested against hetu at a pinned commit, so a change in hetu reaches them only when the pin moves

## Run

hetu is a submodule at the pinned commit. Its own packages are installed in it, then the SDK is taken from it by a file link

```
git submodule update --init
(cd hetu && npm ci --ignore-scripts)
npm ci --ignore-scripts
npm run typecheck
npm run build
npm test
```

`npm run build` builds each plugin's worker into its `dist/` and checks its manifest against what was built
