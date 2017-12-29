const marked = require("marked");
const highlight = require("highlight.js");
const renderer = new marked.Renderer();
const codeRenderer = renderer.code;
const path = require("path");
const crypto = require("crypto");
const hash = crypto.createHash("md5");
module.exports = async function(ctx) {
    let hlStyle = await ctx.fs.readFile(
        path.resolve(
            __dirname,
            "./node_modules/highlight.js/styles/default.css"
        )
    );
    hlStyle = hlStyle.toString();
    ctx.hook.add("pipe.before", function(file) {
        const styles = [];
        const scripts = [];
        let contents = file.contents.toString();
        renderer.code = function(code, language) {
            let result = codeRenderer.call(this, code, language);
            if (language === "js" || language === "javascript") {
                scripts.push(`
                    ${code}
                `);
            }
            if (language === "example") {
                hash.update(code);
                const id = hash.digest("hex");
                scripts.push(`
                    var element = document.getElementById('${id}');
                    ${code}
                `);
                result = `<div class="example"><div class="example-container" id="${id}"></div>${codeRenderer.call(
                    this,
                    code,
                    "javascript"
                )}`;
            }
            if (language === "css" || language === "style") {
                styles.push(code);
            }
            return result;
        };
        contents = marked(contents, {
            renderer: renderer,
            langPrefix: "hljs ",
            headerPrefix: "header",
            highlight: function(code) {
                return highlight.highlightAuto(code).value;
            }
        });
        file.md = {
            contents: contents,
            hlStyle: hlStyle,
            styles: styles,
            scripts: scripts
        };
        console.log(file.md);
        file.contents = null;
    });
};
