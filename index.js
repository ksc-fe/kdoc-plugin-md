const marked = require("marked");
const highlight = require("highlight.js");
const yaml = require("js-yaml");
const renderer = new marked.Renderer();
const codeRenderer = renderer.code;
const path = require("path");
const crypto = require("crypto");
const hash = crypto.createHash("md5");

const parsingYaml = function(contents) {
    const result = {};
    result.content = contents.replace(/---\s*\n+\s*((?:.|\n)*)\n+---/, function(
        all,
        matched
    ) {
        result.setting = yaml.safeLoad(matched);
        return "";
    });
    return result;
};

module.exports = async function(ctx) {
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
    const hljsStyle = await requireCss("highlight.js/styles/dracula.css");
    ctx.data.mdHljsStyle = hljsStyle.toString();
    ctx.hook.add("pipe", function(file) {
        const codes = [];
        let contents = file.contents.toString();
        //解析yaml
        const parsed = parsingYaml(contents);
        contents = parsed.content;
        let setting = parsed.setting;
        let catalogs = [];
        renderer.heading = function(text, level, raw) {
            const id = this.options.headerPrefix
                ? `${this.options.headerPrefix}-${encodeURIComponent(raw)}`
                : encodeURIComponent(raw);
            let result = `<h${level} id='${id}'>${text}</h${level}>`;
            catalogs.push({
                text: text,
                level: level,
                id: id,
                content: result
            });
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
                    content: `var element = document.getElementById('${id}');${code};`
                });
                result = `<div class="example"><div class="example-container" id="${id}"></div>${codeRenderer.call(
                    this,
                    code,
                    language
                )}`;
            } else {
                codes.push({
                    language: language,
                    content: code
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
            setting: setting,
            catalogs: catalogs,
            contents: contents,
            codes: codes
        };
        file.contents = null;
    });
};
