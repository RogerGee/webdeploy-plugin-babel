# webdeploy-plugin-babel

> Build plugin for integration between webdeploy and Babel

## Install

~~~
npm install --save-dev @webdeploy/plugin-babel @babel/core [plugins...]
~~~

## Config

~~~javascript
{
  id: "babel",
  plugins: [],
  presets: []
}
~~~

Currently only `plugins` and `presets` are supported. These are forwarded directly to Babel.

