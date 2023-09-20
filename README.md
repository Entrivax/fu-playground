# Fusion Playground

This repository contains the sources for a Fusion Playground.

This project is not official and was made just for fun.

## Prerequisite

Clone the repository and its submodules with:
```sh
git clone --recursive https://github.com/Entrivax/fu-playground
```

You need to install the npm packages before building the project:
```sh
npm install
```

## How to build

To build the project, you can simply do:
```sh
npm run build
```

To build-watch the project:
```sh
npm run watch
```

Then open the `index.html` file through an HTTP server.

To deploy the project after build, copy the file `index.html` and the folder `dist` where you want to deploy it.