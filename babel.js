// babel.js - webdeploy build plugin

const { format } = require("util");
const babel = require("@babel/core");

module.exports = {
    exec: async (target,settings,context) => {
        const code = await target.loadContent();
        const babelOptions = {
            // Make babel work under the webdeploy project base path.
            cwd: context.basePath,

            presets: settings.presets || [],
            plugins: settings.plugins || []
        };

        const transpilation = babel.transform(code,babelOptions);
        const outputTarget = target.makeOutputTarget();

        outputTarget.stream.end(transpilation.code);

        return outputTarget;
    }
};
