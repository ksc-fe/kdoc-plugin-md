const marked = require("marked");
const highlight = require("highlight.js");
const renderer = new marked.Renderer();
const codeRenderer = renderer.code;
const headingRenderer = renderer.heading;
const path = require("path");
const crypto = require("crypto");
const hash = crypto.createHash("md5");

module.exports = async function(ctx) {
    ctx.data.md = {};
    async function requireCss(_path) {
        let style = "";
        try {
            style = await ctx.fs.readFile(
                path.resolve(__dirname, `./node_modules/${_path}`)
            );
        } catch (error) {
            try {
                style = await ctx.fs.readFile(
                    path.resolve(__dirname, "../", `./node_modules/${_path}`)
                );
            } catch (error) {}
        }
        return style;
    }
    const hljsStyle = await requireCss("highlight.js/styles/default.css");
    const hljsPath = "./hljs.css";
    ctx.data.md.hljsStyle = hljsStyle.toString();
    ctx.data.md.hljsPath = hljsPath;
    ctx.hook.add("pipe", function(file) {
        const codes = [];
        let contents = file.contents.toString();
        let title = "";
        let subtitle = "";
        renderer.heading = function(text, level, raw) {
            if (level === 1) {
                title = text;
            }
            if (level === 2) {
                subtitle = text;
            }
            let result = headingRenderer.call(this, text, level, raw);
            return result;
        };
        const exampleReg = /^(example-)/;
        renderer.code = function(code, language) {
            if (language === "example") {
                language = "example-js";
            }
            let result = codeRenderer.call(this, code, language);
            if (exampleReg.test(language)) {
                language = language.replace(exampleReg, "");
                hash.update(code);
                const id = hash.digest("hex");
                codes.push({
                    language: language,
                    contents: `var element = document.getElementById('${id}');${code};`
                });
                result = `<div class="example"><div class="example-container" id="${id}"></div>${codeRenderer.call(
                    this,
                    code,
                    language
                )}`;
            } else {
                codes.push({
                    language: language,
                    contents: code
                });
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
            source: file.contents,
            title: title,
            subtitle: subtitle,
            contents: contents,
            codes: codes
        };
        file.contents = null;
    });
};
