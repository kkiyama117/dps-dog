async function execute(denops, script, ctx = {
}) {
    if (Array.isArray(script)) {
        ctx = {
            ...ctx,
            __denops_internal_command: script.map((x)=>x.replace(/^\s+|\s+$/g, "")
            ).filter((x)=>!!x
            )
        };
        await denops.cmd("call execute(l:__denops_internal_command, '')", ctx);
        return;
    }
    script = script.replace(/\r?\n\s*\\/g, "");
    await execute(denops, script.split(/\r?\n/g), ctx);
}
async function autocmd(denops, group, main) {
    const commands = [];
    const helper = new AutocmdHelper(commands);
    main(helper);
    if (group) {
        commands.unshift(`aug ${group}`);
        commands.push("aug END");
    }
    await execute(denops, commands);
}
class AutocmdHelper {
    #commands;
    constructor(commands){
        this.#commands = commands;
    }
    define(event, pat, cmd, options = {
    }) {
        const terms = [
            "au"
        ];
        if (Array.isArray(event)) {
            terms.push(event.join(","));
        } else {
            terms.push(event);
        }
        if (Array.isArray(pat)) {
            terms.push(pat.join(","));
        } else {
            terms.push(pat);
        }
        if (options.once) {
            terms.push("++once");
        }
        if (options.nested) {
            terms.push("++nested");
        }
        terms.push(cmd);
        this.#commands.push(terms.join(" "));
    }
    remove(event, pat, options = {
    }) {
        const terms = [
            "au!"
        ];
        if (event) {
            if (Array.isArray(event)) {
                terms.push(event.join(","));
            } else {
                terms.push(event);
            }
            if (pat) {
                if (Array.isArray(pat)) {
                    terms.push(pat.join(","));
                } else {
                    terms.push(pat);
                }
                if (options.once) {
                    terms.push("++once");
                }
                if (options.nested) {
                    terms.push("++nested");
                }
            }
        }
        this.#commands.push(terms.join(" "));
    }
}
async function getVar(denops, group, prop, defaultValue) {
    const result = await denops.eval(`get(${group}:, name, value)`, {
        name: prop,
        value: defaultValue ?? null
    });
    return result;
}
async function setVar(denops, group, prop, value) {
    const name = `${group}:${prop}`;
    await denops.cmd(`let ${name} = value`, {
        value
    });
}
async function removeVar(denops, group, prop) {
    const name = `${group}:${prop}`;
    await denops.cmd(`unlet ${name}`);
}
class VariableHelper {
    #denops;
    #group;
    constructor(denops, group1){
        this.#denops = denops;
        this.#group = group1;
    }
    async get(prop, defaultValue) {
        return await getVar(this.#denops, this.#group, prop, defaultValue);
    }
    async set(prop, value) {
        await setVar(this.#denops, this.#group, prop, value);
    }
    async remove(prop) {
        await removeVar(this.#denops, this.#group, prop);
    }
}
const osType = (()=>{
    if (globalThis.Deno != null) {
        return Deno.build.os;
    }
    const navigator = globalThis.navigator;
    if (navigator?.appVersion?.includes?.("Win") ?? false) {
        return "windows";
    }
    return "linux";
})();
const isWindows = osType === "windows";
const CHAR_FORWARD_SLASH = 47;
function assertPath(path) {
    if (typeof path !== "string") {
        throw new TypeError(`Path must be a string. Received ${JSON.stringify(path)}`);
    }
}
function isPosixPathSeparator(code) {
    return code === 47;
}
function isPathSeparator(code) {
    return isPosixPathSeparator(code) || code === 92;
}
function isWindowsDeviceRoot(code) {
    return code >= 97 && code <= 122 || code >= 65 && code <= 90;
}
function normalizeString(path, allowAboveRoot, separator, isPathSeparator1) {
    let res = "";
    let lastSegmentLength = 0;
    let lastSlash = -1;
    let dots = 0;
    let code;
    for(let i = 0, len = path.length; i <= len; ++i){
        if (i < len) code = path.charCodeAt(i);
        else if (isPathSeparator1(code)) break;
        else code = CHAR_FORWARD_SLASH;
        if (isPathSeparator1(code)) {
            if (lastSlash === i - 1 || dots === 1) {
            } else if (lastSlash !== i - 1 && dots === 2) {
                if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 || res.charCodeAt(res.length - 2) !== 46) {
                    if (res.length > 2) {
                        const lastSlashIndex = res.lastIndexOf(separator);
                        if (lastSlashIndex === -1) {
                            res = "";
                            lastSegmentLength = 0;
                        } else {
                            res = res.slice(0, lastSlashIndex);
                            lastSegmentLength = res.length - 1 - res.lastIndexOf(separator);
                        }
                        lastSlash = i;
                        dots = 0;
                        continue;
                    } else if (res.length === 2 || res.length === 1) {
                        res = "";
                        lastSegmentLength = 0;
                        lastSlash = i;
                        dots = 0;
                        continue;
                    }
                }
                if (allowAboveRoot) {
                    if (res.length > 0) res += `${separator}..`;
                    else res = "..";
                    lastSegmentLength = 2;
                }
            } else {
                if (res.length > 0) res += separator + path.slice(lastSlash + 1, i);
                else res = path.slice(lastSlash + 1, i);
                lastSegmentLength = i - lastSlash - 1;
            }
            lastSlash = i;
            dots = 0;
        } else if (code === 46 && dots !== -1) {
            ++dots;
        } else {
            dots = -1;
        }
    }
    return res;
}
function _format(sep, pathObject) {
    const dir = pathObject.dir || pathObject.root;
    const base = pathObject.base || (pathObject.name || "") + (pathObject.ext || "");
    if (!dir) return base;
    if (dir === pathObject.root) return dir + base;
    return dir + sep + base;
}
const WHITESPACE_ENCODINGS = {
    "\u0009": "%09",
    "\u000A": "%0A",
    "\u000B": "%0B",
    "\u000C": "%0C",
    "\u000D": "%0D",
    "\u0020": "%20"
};
function encodeWhitespace(string) {
    return string.replaceAll(/[\s]/g, (c)=>{
        return WHITESPACE_ENCODINGS[c] ?? c;
    });
}
class DenoStdInternalError extends Error {
    constructor(message){
        super(message);
        this.name = "DenoStdInternalError";
    }
}
function assert(expr, msg = "") {
    if (!expr) {
        throw new DenoStdInternalError(msg);
    }
}
const sep = "\\";
const delimiter = ";";
function resolve(...pathSegments) {
    let resolvedDevice = "";
    let resolvedTail = "";
    let resolvedAbsolute = false;
    for(let i = pathSegments.length - 1; i >= -1; i--){
        let path;
        if (i >= 0) {
            path = pathSegments[i];
        } else if (!resolvedDevice) {
            if (globalThis.Deno == null) {
                throw new TypeError("Resolved a drive-letter-less path without a CWD.");
            }
            path = Deno.cwd();
        } else {
            if (globalThis.Deno == null) {
                throw new TypeError("Resolved a relative path without a CWD.");
            }
            path = Deno.env.get(`=${resolvedDevice}`) || Deno.cwd();
            if (path === undefined || path.slice(0, 3).toLowerCase() !== `${resolvedDevice.toLowerCase()}\\`) {
                path = `${resolvedDevice}\\`;
            }
        }
        assertPath(path);
        const len = path.length;
        if (len === 0) continue;
        let rootEnd = 0;
        let device = "";
        let isAbsolute = false;
        const code = path.charCodeAt(0);
        if (len > 1) {
            if (isPathSeparator(code)) {
                isAbsolute = true;
                if (isPathSeparator(path.charCodeAt(1))) {
                    let j = 2;
                    let last = j;
                    for(; j < len; ++j){
                        if (isPathSeparator(path.charCodeAt(j))) break;
                    }
                    if (j < len && j !== last) {
                        const firstPart = path.slice(last, j);
                        last = j;
                        for(; j < len; ++j){
                            if (!isPathSeparator(path.charCodeAt(j))) break;
                        }
                        if (j < len && j !== last) {
                            last = j;
                            for(; j < len; ++j){
                                if (isPathSeparator(path.charCodeAt(j))) break;
                            }
                            if (j === len) {
                                device = `\\\\${firstPart}\\${path.slice(last)}`;
                                rootEnd = j;
                            } else if (j !== last) {
                                device = `\\\\${firstPart}\\${path.slice(last, j)}`;
                                rootEnd = j;
                            }
                        }
                    }
                } else {
                    rootEnd = 1;
                }
            } else if (isWindowsDeviceRoot(code)) {
                if (path.charCodeAt(1) === 58) {
                    device = path.slice(0, 2);
                    rootEnd = 2;
                    if (len > 2) {
                        if (isPathSeparator(path.charCodeAt(2))) {
                            isAbsolute = true;
                            rootEnd = 3;
                        }
                    }
                }
            }
        } else if (isPathSeparator(code)) {
            rootEnd = 1;
            isAbsolute = true;
        }
        if (device.length > 0 && resolvedDevice.length > 0 && device.toLowerCase() !== resolvedDevice.toLowerCase()) {
            continue;
        }
        if (resolvedDevice.length === 0 && device.length > 0) {
            resolvedDevice = device;
        }
        if (!resolvedAbsolute) {
            resolvedTail = `${path.slice(rootEnd)}\\${resolvedTail}`;
            resolvedAbsolute = isAbsolute;
        }
        if (resolvedAbsolute && resolvedDevice.length > 0) break;
    }
    resolvedTail = normalizeString(resolvedTail, !resolvedAbsolute, "\\", isPathSeparator);
    return resolvedDevice + (resolvedAbsolute ? "\\" : "") + resolvedTail || ".";
}
function normalize(path) {
    assertPath(path);
    const len = path.length;
    if (len === 0) return ".";
    let rootEnd = 0;
    let device;
    let isAbsolute = false;
    const code = path.charCodeAt(0);
    if (len > 1) {
        if (isPathSeparator(code)) {
            isAbsolute = true;
            if (isPathSeparator(path.charCodeAt(1))) {
                let j = 2;
                let last = j;
                for(; j < len; ++j){
                    if (isPathSeparator(path.charCodeAt(j))) break;
                }
                if (j < len && j !== last) {
                    const firstPart = path.slice(last, j);
                    last = j;
                    for(; j < len; ++j){
                        if (!isPathSeparator(path.charCodeAt(j))) break;
                    }
                    if (j < len && j !== last) {
                        last = j;
                        for(; j < len; ++j){
                            if (isPathSeparator(path.charCodeAt(j))) break;
                        }
                        if (j === len) {
                            return `\\\\${firstPart}\\${path.slice(last)}\\`;
                        } else if (j !== last) {
                            device = `\\\\${firstPart}\\${path.slice(last, j)}`;
                            rootEnd = j;
                        }
                    }
                }
            } else {
                rootEnd = 1;
            }
        } else if (isWindowsDeviceRoot(code)) {
            if (path.charCodeAt(1) === 58) {
                device = path.slice(0, 2);
                rootEnd = 2;
                if (len > 2) {
                    if (isPathSeparator(path.charCodeAt(2))) {
                        isAbsolute = true;
                        rootEnd = 3;
                    }
                }
            }
        }
    } else if (isPathSeparator(code)) {
        return "\\";
    }
    let tail;
    if (rootEnd < len) {
        tail = normalizeString(path.slice(rootEnd), !isAbsolute, "\\", isPathSeparator);
    } else {
        tail = "";
    }
    if (tail.length === 0 && !isAbsolute) tail = ".";
    if (tail.length > 0 && isPathSeparator(path.charCodeAt(len - 1))) {
        tail += "\\";
    }
    if (device === undefined) {
        if (isAbsolute) {
            if (tail.length > 0) return `\\${tail}`;
            else return "\\";
        } else if (tail.length > 0) {
            return tail;
        } else {
            return "";
        }
    } else if (isAbsolute) {
        if (tail.length > 0) return `${device}\\${tail}`;
        else return `${device}\\`;
    } else if (tail.length > 0) {
        return device + tail;
    } else {
        return device;
    }
}
function isAbsolute(path) {
    assertPath(path);
    const len = path.length;
    if (len === 0) return false;
    const code = path.charCodeAt(0);
    if (isPathSeparator(code)) {
        return true;
    } else if (isWindowsDeviceRoot(code)) {
        if (len > 2 && path.charCodeAt(1) === 58) {
            if (isPathSeparator(path.charCodeAt(2))) return true;
        }
    }
    return false;
}
function join(...paths) {
    const pathsCount = paths.length;
    if (pathsCount === 0) return ".";
    let joined;
    let firstPart = null;
    for(let i = 0; i < pathsCount; ++i){
        const path = paths[i];
        assertPath(path);
        if (path.length > 0) {
            if (joined === undefined) joined = firstPart = path;
            else joined += `\\${path}`;
        }
    }
    if (joined === undefined) return ".";
    let needsReplace = true;
    let slashCount = 0;
    assert(firstPart != null);
    if (isPathSeparator(firstPart.charCodeAt(0))) {
        ++slashCount;
        const firstLen = firstPart.length;
        if (firstLen > 1) {
            if (isPathSeparator(firstPart.charCodeAt(1))) {
                ++slashCount;
                if (firstLen > 2) {
                    if (isPathSeparator(firstPart.charCodeAt(2))) ++slashCount;
                    else {
                        needsReplace = false;
                    }
                }
            }
        }
    }
    if (needsReplace) {
        for(; slashCount < joined.length; ++slashCount){
            if (!isPathSeparator(joined.charCodeAt(slashCount))) break;
        }
        if (slashCount >= 2) joined = `\\${joined.slice(slashCount)}`;
    }
    return normalize(joined);
}
function relative(from, to) {
    assertPath(from);
    assertPath(to);
    if (from === to) return "";
    const fromOrig = resolve(from);
    const toOrig = resolve(to);
    if (fromOrig === toOrig) return "";
    from = fromOrig.toLowerCase();
    to = toOrig.toLowerCase();
    if (from === to) return "";
    let fromStart = 0;
    let fromEnd = from.length;
    for(; fromStart < fromEnd; ++fromStart){
        if (from.charCodeAt(fromStart) !== 92) break;
    }
    for(; fromEnd - 1 > fromStart; --fromEnd){
        if (from.charCodeAt(fromEnd - 1) !== 92) break;
    }
    const fromLen = fromEnd - fromStart;
    let toStart = 0;
    let toEnd = to.length;
    for(; toStart < toEnd; ++toStart){
        if (to.charCodeAt(toStart) !== 92) break;
    }
    for(; toEnd - 1 > toStart; --toEnd){
        if (to.charCodeAt(toEnd - 1) !== 92) break;
    }
    const toLen = toEnd - toStart;
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i = 0;
    for(; i <= length; ++i){
        if (i === length) {
            if (toLen > length) {
                if (to.charCodeAt(toStart + i) === 92) {
                    return toOrig.slice(toStart + i + 1);
                } else if (i === 2) {
                    return toOrig.slice(toStart + i);
                }
            }
            if (fromLen > length) {
                if (from.charCodeAt(fromStart + i) === 92) {
                    lastCommonSep = i;
                } else if (i === 2) {
                    lastCommonSep = 3;
                }
            }
            break;
        }
        const fromCode = from.charCodeAt(fromStart + i);
        const toCode = to.charCodeAt(toStart + i);
        if (fromCode !== toCode) break;
        else if (fromCode === 92) lastCommonSep = i;
    }
    if (i !== length && lastCommonSep === -1) {
        return toOrig;
    }
    let out = "";
    if (lastCommonSep === -1) lastCommonSep = 0;
    for(i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i){
        if (i === fromEnd || from.charCodeAt(i) === 92) {
            if (out.length === 0) out += "..";
            else out += "\\..";
        }
    }
    if (out.length > 0) {
        return out + toOrig.slice(toStart + lastCommonSep, toEnd);
    } else {
        toStart += lastCommonSep;
        if (toOrig.charCodeAt(toStart) === 92) ++toStart;
        return toOrig.slice(toStart, toEnd);
    }
}
function toNamespacedPath(path) {
    if (typeof path !== "string") return path;
    if (path.length === 0) return "";
    const resolvedPath = resolve(path);
    if (resolvedPath.length >= 3) {
        if (resolvedPath.charCodeAt(0) === 92) {
            if (resolvedPath.charCodeAt(1) === 92) {
                const code = resolvedPath.charCodeAt(2);
                if (code !== 63 && code !== 46) {
                    return `\\\\?\\UNC\\${resolvedPath.slice(2)}`;
                }
            }
        } else if (isWindowsDeviceRoot(resolvedPath.charCodeAt(0))) {
            if (resolvedPath.charCodeAt(1) === 58 && resolvedPath.charCodeAt(2) === 92) {
                return `\\\\?\\${resolvedPath}`;
            }
        }
    }
    return path;
}
function dirname(path) {
    assertPath(path);
    const len = path.length;
    if (len === 0) return ".";
    let rootEnd = -1;
    let end = -1;
    let matchedSlash = true;
    let offset = 0;
    const code = path.charCodeAt(0);
    if (len > 1) {
        if (isPathSeparator(code)) {
            rootEnd = offset = 1;
            if (isPathSeparator(path.charCodeAt(1))) {
                let j = 2;
                let last = j;
                for(; j < len; ++j){
                    if (isPathSeparator(path.charCodeAt(j))) break;
                }
                if (j < len && j !== last) {
                    last = j;
                    for(; j < len; ++j){
                        if (!isPathSeparator(path.charCodeAt(j))) break;
                    }
                    if (j < len && j !== last) {
                        last = j;
                        for(; j < len; ++j){
                            if (isPathSeparator(path.charCodeAt(j))) break;
                        }
                        if (j === len) {
                            return path;
                        }
                        if (j !== last) {
                            rootEnd = offset = j + 1;
                        }
                    }
                }
            }
        } else if (isWindowsDeviceRoot(code)) {
            if (path.charCodeAt(1) === 58) {
                rootEnd = offset = 2;
                if (len > 2) {
                    if (isPathSeparator(path.charCodeAt(2))) rootEnd = offset = 3;
                }
            }
        }
    } else if (isPathSeparator(code)) {
        return path;
    }
    for(let i = len - 1; i >= offset; --i){
        if (isPathSeparator(path.charCodeAt(i))) {
            if (!matchedSlash) {
                end = i;
                break;
            }
        } else {
            matchedSlash = false;
        }
    }
    if (end === -1) {
        if (rootEnd === -1) return ".";
        else end = rootEnd;
    }
    return path.slice(0, end);
}
function basename(path, ext = "") {
    if (ext !== undefined && typeof ext !== "string") {
        throw new TypeError('"ext" argument must be a string');
    }
    assertPath(path);
    let start = 0;
    let end = -1;
    let matchedSlash = true;
    let i;
    if (path.length >= 2) {
        const drive = path.charCodeAt(0);
        if (isWindowsDeviceRoot(drive)) {
            if (path.charCodeAt(1) === 58) start = 2;
        }
    }
    if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
        if (ext.length === path.length && ext === path) return "";
        let extIdx = ext.length - 1;
        let firstNonSlashEnd = -1;
        for(i = path.length - 1; i >= start; --i){
            const code = path.charCodeAt(i);
            if (isPathSeparator(code)) {
                if (!matchedSlash) {
                    start = i + 1;
                    break;
                }
            } else {
                if (firstNonSlashEnd === -1) {
                    matchedSlash = false;
                    firstNonSlashEnd = i + 1;
                }
                if (extIdx >= 0) {
                    if (code === ext.charCodeAt(extIdx)) {
                        if ((--extIdx) === -1) {
                            end = i;
                        }
                    } else {
                        extIdx = -1;
                        end = firstNonSlashEnd;
                    }
                }
            }
        }
        if (start === end) end = firstNonSlashEnd;
        else if (end === -1) end = path.length;
        return path.slice(start, end);
    } else {
        for(i = path.length - 1; i >= start; --i){
            if (isPathSeparator(path.charCodeAt(i))) {
                if (!matchedSlash) {
                    start = i + 1;
                    break;
                }
            } else if (end === -1) {
                matchedSlash = false;
                end = i + 1;
            }
        }
        if (end === -1) return "";
        return path.slice(start, end);
    }
}
function extname(path) {
    assertPath(path);
    let start = 0;
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let preDotState = 0;
    if (path.length >= 2 && path.charCodeAt(1) === 58 && isWindowsDeviceRoot(path.charCodeAt(0))) {
        start = startPart = 2;
    }
    for(let i = path.length - 1; i >= start; --i){
        const code = path.charCodeAt(i);
        if (isPathSeparator(code)) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        return "";
    }
    return path.slice(startDot, end);
}
function format3(pathObject) {
    if (pathObject === null || typeof pathObject !== "object") {
        throw new TypeError(`The "pathObject" argument must be of type Object. Received type ${typeof pathObject}`);
    }
    return _format("\\", pathObject);
}
function parse(path) {
    assertPath(path);
    const ret = {
        root: "",
        dir: "",
        base: "",
        ext: "",
        name: ""
    };
    const len = path.length;
    if (len === 0) return ret;
    let rootEnd = 0;
    let code = path.charCodeAt(0);
    if (len > 1) {
        if (isPathSeparator(code)) {
            rootEnd = 1;
            if (isPathSeparator(path.charCodeAt(1))) {
                let j = 2;
                let last = j;
                for(; j < len; ++j){
                    if (isPathSeparator(path.charCodeAt(j))) break;
                }
                if (j < len && j !== last) {
                    last = j;
                    for(; j < len; ++j){
                        if (!isPathSeparator(path.charCodeAt(j))) break;
                    }
                    if (j < len && j !== last) {
                        last = j;
                        for(; j < len; ++j){
                            if (isPathSeparator(path.charCodeAt(j))) break;
                        }
                        if (j === len) {
                            rootEnd = j;
                        } else if (j !== last) {
                            rootEnd = j + 1;
                        }
                    }
                }
            }
        } else if (isWindowsDeviceRoot(code)) {
            if (path.charCodeAt(1) === 58) {
                rootEnd = 2;
                if (len > 2) {
                    if (isPathSeparator(path.charCodeAt(2))) {
                        if (len === 3) {
                            ret.root = ret.dir = path;
                            return ret;
                        }
                        rootEnd = 3;
                    }
                } else {
                    ret.root = ret.dir = path;
                    return ret;
                }
            }
        }
    } else if (isPathSeparator(code)) {
        ret.root = ret.dir = path;
        return ret;
    }
    if (rootEnd > 0) ret.root = path.slice(0, rootEnd);
    let startDot = -1;
    let startPart = rootEnd;
    let end = -1;
    let matchedSlash = true;
    let i = path.length - 1;
    let preDotState = 0;
    for(; i >= rootEnd; --i){
        code = path.charCodeAt(i);
        if (isPathSeparator(code)) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        if (end !== -1) {
            ret.base = ret.name = path.slice(startPart, end);
        }
    } else {
        ret.name = path.slice(startPart, startDot);
        ret.base = path.slice(startPart, end);
        ret.ext = path.slice(startDot, end);
    }
    if (startPart > 0 && startPart !== rootEnd) {
        ret.dir = path.slice(0, startPart - 1);
    } else ret.dir = ret.root;
    return ret;
}
function fromFileUrl(url) {
    url = url instanceof URL ? url : new URL(url);
    if (url.protocol != "file:") {
        throw new TypeError("Must be a file URL.");
    }
    let path = decodeURIComponent(url.pathname.replace(/\//g, "\\").replace(/%(?![0-9A-Fa-f]{2})/g, "%25")).replace(/^\\*([A-Za-z]:)(\\|$)/, "$1\\");
    if (url.hostname != "") {
        path = `\\\\${url.hostname}${path}`;
    }
    return path;
}
function toFileUrl(path) {
    if (!isAbsolute(path)) {
        throw new TypeError("Must be an absolute path.");
    }
    const [, hostname, pathname] = path.match(/^(?:[/\\]{2}([^/\\]+)(?=[/\\](?:[^/\\]|$)))?(.*)/);
    const url = new URL("file:///");
    url.pathname = encodeWhitespace(pathname.replace(/%/g, "%25"));
    if (hostname != null && hostname != "localhost") {
        url.hostname = hostname;
        if (!url.hostname) {
            throw new TypeError("Invalid hostname.");
        }
    }
    return url;
}
const mod = function() {
    return {
        sep: sep,
        delimiter: delimiter,
        resolve: resolve,
        normalize: normalize,
        isAbsolute: isAbsolute,
        join: join,
        relative: relative,
        toNamespacedPath: toNamespacedPath,
        dirname: dirname,
        basename: basename,
        extname: extname,
        format: format3,
        parse: parse,
        fromFileUrl: fromFileUrl,
        toFileUrl: toFileUrl
    };
}();
const sep1 = "/";
const delimiter1 = ":";
function resolve1(...pathSegments) {
    let resolvedPath = "";
    let resolvedAbsolute = false;
    for(let i = pathSegments.length - 1; i >= -1 && !resolvedAbsolute; i--){
        let path;
        if (i >= 0) path = pathSegments[i];
        else {
            if (globalThis.Deno == null) {
                throw new TypeError("Resolved a relative path without a CWD.");
            }
            path = Deno.cwd();
        }
        assertPath(path);
        if (path.length === 0) {
            continue;
        }
        resolvedPath = `${path}/${resolvedPath}`;
        resolvedAbsolute = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
    }
    resolvedPath = normalizeString(resolvedPath, !resolvedAbsolute, "/", isPosixPathSeparator);
    if (resolvedAbsolute) {
        if (resolvedPath.length > 0) return `/${resolvedPath}`;
        else return "/";
    } else if (resolvedPath.length > 0) return resolvedPath;
    else return ".";
}
function normalize1(path) {
    assertPath(path);
    if (path.length === 0) return ".";
    const isAbsolute1 = path.charCodeAt(0) === 47;
    const trailingSeparator = path.charCodeAt(path.length - 1) === 47;
    path = normalizeString(path, !isAbsolute1, "/", isPosixPathSeparator);
    if (path.length === 0 && !isAbsolute1) path = ".";
    if (path.length > 0 && trailingSeparator) path += "/";
    if (isAbsolute1) return `/${path}`;
    return path;
}
function isAbsolute1(path) {
    assertPath(path);
    return path.length > 0 && path.charCodeAt(0) === 47;
}
function join1(...paths) {
    if (paths.length === 0) return ".";
    let joined;
    for(let i = 0, len = paths.length; i < len; ++i){
        const path = paths[i];
        assertPath(path);
        if (path.length > 0) {
            if (!joined) joined = path;
            else joined += `/${path}`;
        }
    }
    if (!joined) return ".";
    return normalize1(joined);
}
function relative1(from, to) {
    assertPath(from);
    assertPath(to);
    if (from === to) return "";
    from = resolve1(from);
    to = resolve1(to);
    if (from === to) return "";
    let fromStart = 1;
    const fromEnd = from.length;
    for(; fromStart < fromEnd; ++fromStart){
        if (from.charCodeAt(fromStart) !== 47) break;
    }
    const fromLen = fromEnd - fromStart;
    let toStart = 1;
    const toEnd = to.length;
    for(; toStart < toEnd; ++toStart){
        if (to.charCodeAt(toStart) !== 47) break;
    }
    const toLen = toEnd - toStart;
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i = 0;
    for(; i <= length; ++i){
        if (i === length) {
            if (toLen > length) {
                if (to.charCodeAt(toStart + i) === 47) {
                    return to.slice(toStart + i + 1);
                } else if (i === 0) {
                    return to.slice(toStart + i);
                }
            } else if (fromLen > length) {
                if (from.charCodeAt(fromStart + i) === 47) {
                    lastCommonSep = i;
                } else if (i === 0) {
                    lastCommonSep = 0;
                }
            }
            break;
        }
        const fromCode = from.charCodeAt(fromStart + i);
        const toCode = to.charCodeAt(toStart + i);
        if (fromCode !== toCode) break;
        else if (fromCode === 47) lastCommonSep = i;
    }
    let out = "";
    for(i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i){
        if (i === fromEnd || from.charCodeAt(i) === 47) {
            if (out.length === 0) out += "..";
            else out += "/..";
        }
    }
    if (out.length > 0) return out + to.slice(toStart + lastCommonSep);
    else {
        toStart += lastCommonSep;
        if (to.charCodeAt(toStart) === 47) ++toStart;
        return to.slice(toStart);
    }
}
function toNamespacedPath1(path) {
    return path;
}
function dirname1(path) {
    assertPath(path);
    if (path.length === 0) return ".";
    const hasRoot = path.charCodeAt(0) === 47;
    let end = -1;
    let matchedSlash = true;
    for(let i = path.length - 1; i >= 1; --i){
        if (path.charCodeAt(i) === 47) {
            if (!matchedSlash) {
                end = i;
                break;
            }
        } else {
            matchedSlash = false;
        }
    }
    if (end === -1) return hasRoot ? "/" : ".";
    if (hasRoot && end === 1) return "//";
    return path.slice(0, end);
}
function basename1(path, ext = "") {
    if (ext !== undefined && typeof ext !== "string") {
        throw new TypeError('"ext" argument must be a string');
    }
    assertPath(path);
    let start = 0;
    let end = -1;
    let matchedSlash = true;
    let i;
    if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
        if (ext.length === path.length && ext === path) return "";
        let extIdx = ext.length - 1;
        let firstNonSlashEnd = -1;
        for(i = path.length - 1; i >= 0; --i){
            const code = path.charCodeAt(i);
            if (code === 47) {
                if (!matchedSlash) {
                    start = i + 1;
                    break;
                }
            } else {
                if (firstNonSlashEnd === -1) {
                    matchedSlash = false;
                    firstNonSlashEnd = i + 1;
                }
                if (extIdx >= 0) {
                    if (code === ext.charCodeAt(extIdx)) {
                        if ((--extIdx) === -1) {
                            end = i;
                        }
                    } else {
                        extIdx = -1;
                        end = firstNonSlashEnd;
                    }
                }
            }
        }
        if (start === end) end = firstNonSlashEnd;
        else if (end === -1) end = path.length;
        return path.slice(start, end);
    } else {
        for(i = path.length - 1; i >= 0; --i){
            if (path.charCodeAt(i) === 47) {
                if (!matchedSlash) {
                    start = i + 1;
                    break;
                }
            } else if (end === -1) {
                matchedSlash = false;
                end = i + 1;
            }
        }
        if (end === -1) return "";
        return path.slice(start, end);
    }
}
function extname1(path) {
    assertPath(path);
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let preDotState = 0;
    for(let i = path.length - 1; i >= 0; --i){
        const code = path.charCodeAt(i);
        if (code === 47) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        return "";
    }
    return path.slice(startDot, end);
}
function format1(pathObject) {
    if (pathObject === null || typeof pathObject !== "object") {
        throw new TypeError(`The "pathObject" argument must be of type Object. Received type ${typeof pathObject}`);
    }
    return _format("/", pathObject);
}
function parse1(path) {
    assertPath(path);
    const ret = {
        root: "",
        dir: "",
        base: "",
        ext: "",
        name: ""
    };
    if (path.length === 0) return ret;
    const isAbsolute2 = path.charCodeAt(0) === 47;
    let start;
    if (isAbsolute2) {
        ret.root = "/";
        start = 1;
    } else {
        start = 0;
    }
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let i = path.length - 1;
    let preDotState = 0;
    for(; i >= start; --i){
        const code = path.charCodeAt(i);
        if (code === 47) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        if (end !== -1) {
            if (startPart === 0 && isAbsolute2) {
                ret.base = ret.name = path.slice(1, end);
            } else {
                ret.base = ret.name = path.slice(startPart, end);
            }
        }
    } else {
        if (startPart === 0 && isAbsolute2) {
            ret.name = path.slice(1, startDot);
            ret.base = path.slice(1, end);
        } else {
            ret.name = path.slice(startPart, startDot);
            ret.base = path.slice(startPart, end);
        }
        ret.ext = path.slice(startDot, end);
    }
    if (startPart > 0) ret.dir = path.slice(0, startPart - 1);
    else if (isAbsolute2) ret.dir = "/";
    return ret;
}
function fromFileUrl1(url) {
    url = url instanceof URL ? url : new URL(url);
    if (url.protocol != "file:") {
        throw new TypeError("Must be a file URL.");
    }
    return decodeURIComponent(url.pathname.replace(/%(?![0-9A-Fa-f]{2})/g, "%25"));
}
function toFileUrl1(path) {
    if (!isAbsolute1(path)) {
        throw new TypeError("Must be an absolute path.");
    }
    const url = new URL("file:///");
    url.pathname = encodeWhitespace(path.replace(/%/g, "%25").replace(/\\/g, "%5C"));
    return url;
}
const mod1 = function() {
    return {
        sep: sep1,
        delimiter: delimiter1,
        resolve: resolve1,
        normalize: normalize1,
        isAbsolute: isAbsolute1,
        join: join1,
        relative: relative1,
        toNamespacedPath: toNamespacedPath1,
        dirname: dirname1,
        basename: basename1,
        extname: extname1,
        format: format1,
        parse: parse1,
        fromFileUrl: fromFileUrl1,
        toFileUrl: toFileUrl1
    };
}();
const SEP = isWindows ? "\\" : "/";
const SEP_PATTERN = isWindows ? /[\\/]+/ : /\/+/;
function common(paths, sep2 = SEP) {
    const [first = "", ...remaining] = paths;
    if (first === "" || remaining.length === 0) {
        return first.substring(0, first.lastIndexOf(sep2) + 1);
    }
    const parts = first.split(sep2);
    let endOfPrefix = parts.length;
    for (const path of remaining){
        const compare = path.split(sep2);
        for(let i = 0; i < endOfPrefix; i++){
            if (compare[i] !== parts[i]) {
                endOfPrefix = i;
            }
        }
        if (endOfPrefix === 0) {
            return "";
        }
    }
    const prefix = parts.slice(0, endOfPrefix).join(sep2);
    return prefix.endsWith(sep2) ? prefix : `${prefix}${sep2}`;
}
const path = isWindows ? mod : mod1;
const { join: join2 , normalize: normalize2  } = path;
const regExpEscapeChars = [
    "!",
    "$",
    "(",
    ")",
    "*",
    "+",
    ".",
    "=",
    "?",
    "[",
    "\\",
    "^",
    "{",
    "|"
];
const rangeEscapeChars = [
    "-",
    "\\",
    "]"
];
function globToRegExp(glob, { extended =true , globstar: globstarOption = true , os =osType , caseInsensitive =false  } = {
}) {
    if (glob == "") {
        return /(?!)/;
    }
    const sep2 = os == "windows" ? "(?:\\\\|/)+" : "/+";
    const sepMaybe = os == "windows" ? "(?:\\\\|/)*" : "/*";
    const seps = os == "windows" ? [
        "\\",
        "/"
    ] : [
        "/"
    ];
    const globstar = os == "windows" ? "(?:[^\\\\/]*(?:\\\\|/|$)+)*" : "(?:[^/]*(?:/|$)+)*";
    const wildcard = os == "windows" ? "[^\\\\/]*" : "[^/]*";
    const escapePrefix = os == "windows" ? "`" : "\\";
    let newLength = glob.length;
    for(; newLength > 1 && seps.includes(glob[newLength - 1]); newLength--);
    glob = glob.slice(0, newLength);
    let regExpString = "";
    for(let j = 0; j < glob.length;){
        let segment = "";
        const groupStack = [];
        let inRange = false;
        let inEscape = false;
        let endsWithSep = false;
        let i = j;
        for(; i < glob.length && !seps.includes(glob[i]); i++){
            if (inEscape) {
                inEscape = false;
                const escapeChars = inRange ? rangeEscapeChars : regExpEscapeChars;
                segment += escapeChars.includes(glob[i]) ? `\\${glob[i]}` : glob[i];
                continue;
            }
            if (glob[i] == escapePrefix) {
                inEscape = true;
                continue;
            }
            if (glob[i] == "[") {
                if (!inRange) {
                    inRange = true;
                    segment += "[";
                    if (glob[i + 1] == "!") {
                        i++;
                        segment += "^";
                    } else if (glob[i + 1] == "^") {
                        i++;
                        segment += "\\^";
                    }
                    continue;
                } else if (glob[i + 1] == ":") {
                    let k = i + 1;
                    let value = "";
                    while(glob[k + 1] != null && glob[k + 1] != ":"){
                        value += glob[k + 1];
                        k++;
                    }
                    if (glob[k + 1] == ":" && glob[k + 2] == "]") {
                        i = k + 2;
                        if (value == "alnum") segment += "\\dA-Za-z";
                        else if (value == "alpha") segment += "A-Za-z";
                        else if (value == "ascii") segment += "\x00-\x7F";
                        else if (value == "blank") segment += "\t ";
                        else if (value == "cntrl") segment += "\x00-\x1F\x7F";
                        else if (value == "digit") segment += "\\d";
                        else if (value == "graph") segment += "\x21-\x7E";
                        else if (value == "lower") segment += "a-z";
                        else if (value == "print") segment += "\x20-\x7E";
                        else if (value == "punct") {
                            segment += "!\"#$%&'()*+,\\-./:;<=>?@[\\\\\\]^_‘{|}~";
                        } else if (value == "space") segment += "\\s\v";
                        else if (value == "upper") segment += "A-Z";
                        else if (value == "word") segment += "\\w";
                        else if (value == "xdigit") segment += "\\dA-Fa-f";
                        continue;
                    }
                }
            }
            if (glob[i] == "]" && inRange) {
                inRange = false;
                segment += "]";
                continue;
            }
            if (inRange) {
                if (glob[i] == "\\") {
                    segment += `\\\\`;
                } else {
                    segment += glob[i];
                }
                continue;
            }
            if (glob[i] == ")" && groupStack.length > 0 && groupStack[groupStack.length - 1] != "BRACE") {
                segment += ")";
                const type = groupStack.pop();
                if (type == "!") {
                    segment += wildcard;
                } else if (type != "@") {
                    segment += type;
                }
                continue;
            }
            if (glob[i] == "|" && groupStack.length > 0 && groupStack[groupStack.length - 1] != "BRACE") {
                segment += "|";
                continue;
            }
            if (glob[i] == "+" && extended && glob[i + 1] == "(") {
                i++;
                groupStack.push("+");
                segment += "(?:";
                continue;
            }
            if (glob[i] == "@" && extended && glob[i + 1] == "(") {
                i++;
                groupStack.push("@");
                segment += "(?:";
                continue;
            }
            if (glob[i] == "?") {
                if (extended && glob[i + 1] == "(") {
                    i++;
                    groupStack.push("?");
                    segment += "(?:";
                } else {
                    segment += ".";
                }
                continue;
            }
            if (glob[i] == "!" && extended && glob[i + 1] == "(") {
                i++;
                groupStack.push("!");
                segment += "(?!";
                continue;
            }
            if (glob[i] == "{") {
                groupStack.push("BRACE");
                segment += "(?:";
                continue;
            }
            if (glob[i] == "}" && groupStack[groupStack.length - 1] == "BRACE") {
                groupStack.pop();
                segment += ")";
                continue;
            }
            if (glob[i] == "," && groupStack[groupStack.length - 1] == "BRACE") {
                segment += "|";
                continue;
            }
            if (glob[i] == "*") {
                if (extended && glob[i + 1] == "(") {
                    i++;
                    groupStack.push("*");
                    segment += "(?:";
                } else {
                    const prevChar = glob[i - 1];
                    let numStars = 1;
                    while(glob[i + 1] == "*"){
                        i++;
                        numStars++;
                    }
                    const nextChar = glob[i + 1];
                    if (globstarOption && numStars == 2 && [
                        ...seps,
                        undefined
                    ].includes(prevChar) && [
                        ...seps,
                        undefined
                    ].includes(nextChar)) {
                        segment += globstar;
                        endsWithSep = true;
                    } else {
                        segment += wildcard;
                    }
                }
                continue;
            }
            segment += regExpEscapeChars.includes(glob[i]) ? `\\${glob[i]}` : glob[i];
        }
        if (groupStack.length > 0 || inRange || inEscape) {
            segment = "";
            for (const c of glob.slice(j, i)){
                segment += regExpEscapeChars.includes(c) ? `\\${c}` : c;
                endsWithSep = false;
            }
        }
        regExpString += segment;
        if (!endsWithSep) {
            regExpString += i < glob.length ? sep2 : sepMaybe;
            endsWithSep = true;
        }
        while(seps.includes(glob[i]))i++;
        if (!(i > j)) {
            throw new Error("Assertion failure: i > j (potential infinite loop)");
        }
        j = i;
    }
    regExpString = `^${regExpString}$`;
    return new RegExp(regExpString, caseInsensitive ? "i" : "");
}
function isGlob(str) {
    const chars = {
        "{": "}",
        "(": ")",
        "[": "]"
    };
    const regex = /\\(.)|(^!|\*|[\].+)]\?|\[[^\\\]]+\]|\{[^\\}]+\}|\(\?[:!=][^\\)]+\)|\([^|]+\|[^\\)]+\))/;
    if (str === "") {
        return false;
    }
    let match;
    while(match = regex.exec(str)){
        if (match[2]) return true;
        let idx = match.index + match[0].length;
        const open = match[1];
        const close = open ? chars[open] : null;
        if (open && close) {
            const n = str.indexOf(close, idx);
            if (n !== -1) {
                idx = n + 1;
            }
        }
        str = str.slice(idx);
    }
    return false;
}
function normalizeGlob(glob, { globstar =false  } = {
}) {
    if (glob.match(/\0/g)) {
        throw new Error(`Glob contains invalid characters: "${glob}"`);
    }
    if (!globstar) {
        return normalize2(glob);
    }
    const s = SEP_PATTERN.source;
    const badParentPattern = new RegExp(`(?<=(${s}|^)\\*\\*${s})\\.\\.(?=${s}|$)`, "g");
    return normalize2(glob.replace(badParentPattern, "\0")).replace(/\0/g, "..");
}
function joinGlobs(globs, { extended =false , globstar =false  } = {
}) {
    if (!globstar || globs.length == 0) {
        return join2(...globs);
    }
    if (globs.length === 0) return ".";
    let joined;
    for (const glob of globs){
        const path1 = glob;
        if (path1.length > 0) {
            if (!joined) joined = path1;
            else joined += `${SEP}${path1}`;
        }
    }
    if (!joined) return ".";
    return normalizeGlob(joined, {
        extended,
        globstar
    });
}
const path1 = isWindows ? mod : mod1;
const { basename: basename2 , delimiter: delimiter2 , dirname: dirname2 , extname: extname2 , format: format2 , fromFileUrl: fromFileUrl2 , isAbsolute: isAbsolute2 , join: join3 , normalize: normalize3 , parse: parse2 , relative: relative2 , resolve: resolve2 , sep: sep2 , toFileUrl: toFileUrl2 , toNamespacedPath: toNamespacedPath2 ,  } = path1;
const mod2 = function() {
    return {
        SEP: SEP,
        SEP_PATTERN: SEP_PATTERN,
        win32: mod,
        posix: mod1,
        basename: basename2,
        delimiter: delimiter2,
        dirname: dirname2,
        extname: extname2,
        format: format2,
        fromFileUrl: fromFileUrl2,
        isAbsolute: isAbsolute2,
        join: join3,
        normalize: normalize3,
        parse: parse2,
        relative: relative2,
        resolve: resolve2,
        sep: sep2,
        toFileUrl: toFileUrl2,
        toNamespacedPath: toNamespacedPath2,
        common,
        globToRegExp,
        isGlob,
        normalizeGlob,
        joinGlobs
    };
}();
const base64abc = [
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "+",
    "/"
];
function encode2(data) {
    const uint8 = typeof data === "string" ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
    let result = "", i;
    const l = uint8.length;
    for(i = 2; i < l; i += 3){
        result += base64abc[uint8[i - 2] >> 2];
        result += base64abc[(uint8[i - 2] & 3) << 4 | uint8[i - 1] >> 4];
        result += base64abc[(uint8[i - 1] & 15) << 2 | uint8[i] >> 6];
        result += base64abc[uint8[i] & 63];
    }
    if (i === l + 1) {
        result += base64abc[uint8[i - 2] >> 2];
        result += base64abc[(uint8[i - 2] & 3) << 4];
        result += "==";
    }
    if (i === l) {
        result += base64abc[uint8[i - 2] >> 2];
        result += base64abc[(uint8[i - 2] & 3) << 4 | uint8[i - 1] >> 4];
        result += base64abc[(uint8[i - 1] & 15) << 2];
        result += "=";
    }
    return result;
}
function decode1(b64) {
    const binString = atob(b64);
    const size = binString.length;
    const bytes = new Uint8Array(size);
    for(let i = 0; i < size; i++){
        bytes[i] = binString.charCodeAt(i);
    }
    return bytes;
}
const importMeta = {
    url: "https://deno.land/std@0.95.0/hash/_wasm/wasm.js",
    main: false
};
const source = decode1("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HiADIAJBmAFqQcgBEIsBIgRBADYCyAEgBEHMAWogAkEIakHIABCLARpB/IXAACEEQQAMEQsgAEHYgcAARwRAIAAoAABB89CFiwNHDRALIAJBkgRqQgA3AQAgAkGaBGpBADsBACACQZwEakIANwIAIAJBpARqQgA3AgAgAkGsBGpCADcCACACQbQEakIANwIAIAJBvARqQgA3AgAgAkHEBGpBADoAACACQcUEakEANgAAIAJByQRqQQA7AAAgAkHLBGpBADoAACACQcAANgKIBCACQQA7AYwEIAJBADYBjgQgAkGYAWogAkGIBGpBxAAQiwEaIAJBqANqIgQgAkHUAWopAgA3AwAgAkGgA2oiBSACQcwBaikCADcDACACQZgDaiIJIAJBxAFqKQIANwMAIAJBkANqIgogAkG8AWopAgA3AwAgAkGIA2oiBiACQbQBaikCADcDACACQYADaiIHIAJBrAFqKQIANwMAIAJB+AJqIgggAkGkAWopAgA3AwAgAiACKQKcATcD8AJB4ABBCBChASIDRQ0XIANCADcDACADQQA2AhwgAyACKQPwAjcDICADQfiXwAApAwA3AwggA0EQakGAmMAAKQMANwMAIANBGGpBiJjAACgCADYCACADQShqIAgpAwA3AwAgA0EwaiAHKQMANwMAIANBOGogBikDADcDACADQUBrIAopAwA3AwAgA0HIAGogCSkDADcDACADQdAAaiAFKQMANwMAIANB2ABqIAQpAwA3AwBB3IHAACEEQQAMEAsgAEGAgsAARg0FIABBgILAAEEGEIMBRQ0FIABBrILAAEYNBiAAQayCwABBBhCDAUUNBiAAQdiCwABGDQcgAEHYgsAAQQYQgwFFDQcgAEGEg8AARwRAIABBhIPAAEEGEIMBDQ8LIAJBADYCiAQgAkGIBGpBBHIhBEEAIQMDQCADIARqQQA6AAAgAiACKAKIBEEBajYCiAQgA0EBaiIDQYABRw0ACyACQZgBaiACQYgEakGEARCLARogAkHwAmogAkGYAWpBBHJBgAEQiwEaQdgBQQgQoQEiA0UNGCADQgA3AwggA0IANwMAIANBADYCUCADQZCZwAApAwA3AxAgA0EYakGYmcAAKQMANwMAIANBIGpBoJnAACkDADcDACADQShqQaiZwAApAwA3AwAgA0EwakGwmcAAKQMANwMAIANBOGpBuJnAACkDADcDACADQUBrQcCZwAApAwA3AwAgA0HIAGpByJnAACkDADcDACADQdQAaiACQfACakGAARCLARpBjIPAACEEQQAMDwsgAEGwg8AARg0HIAApAABC89CFm9PFjJk0UQ0HIABB3IPAAEYNCCAAKQAAQvPQhZvTxcyaNlENCCAAQYiEwABGDQkgACkAAELz0IWb0+WMnDRRDQkgAEG0hMAARwRAIAApAABC89CFm9OlzZgyUg0OCyACQZgBakEAQcgBEJEBGiACQf4CakIANwEAIAJBhgNqQgA3AQAgAkGOA2pCADcBACACQZYDakIANwEAIAJBngNqQgA3AQAgAkGmA2pCADcBACACQa4DakIANwEAIAJBtgNqQQA2AQAgAkG6A2pBADsBACACQQA7AfQCIAJCADcB9gIgAkHIADYC8AIgAkGIBGogAkHwAmpBzAAQiwEaIAJBCGogAkGIBGpBBHJByAAQiwEaQZgCQQgQoQEiA0UNGyADIAJBmAFqQcgBEIsBIgRBADYCyAEgBEHMAWogAkEIakHIABCLARpBvITAACEEQQAMDgsgAkGSBGpCADcBACACQZoEakEAOwEAIAJBEDYCiAQgAkEAOwGMBCACQQA2AY4EIAJBqAFqIgMgAkGYBGoiBCgCADYCACACQaABaiIJIAJBkARqIgUpAwA3AwAgAkHoAmoiBiACQaQBaikCADcDACACIAIpA4gENwOYASACIAIpApwBNwPgAiACQcABaiIHQgA3AwAgAkG4AWoiCEIANwMAIAJBsAFqIg1CADcDACADQgA3AwAgCUIANwMAIAJCADcDmAEgAkH6AmpCADcBACACQYIDakEAOwEAIAJBEDYC8AIgAkEAOwH0AiACQQA2AfYCIAQgAkGAA2ooAgA2AgAgBSACQfgCaiIKKQMANwMAIAJBEGoiCyACQZQEaikCADcDACACIAIpA/ACNwOIBCACIAIpAowENwMIIAJB0AFqIgwgCykDADcDACACIAIpAwg3A8gBIAogBikDADcDACACIAIpA+ACNwPwAiACQcAEaiIGIAwpAwA3AwAgAkG4BGoiCyACKQPIATcDACACQbAEaiIMIAcpAwA3AwAgAkGoBGoiByAIKQMANwMAIAJBoARqIgggDSkDADcDACAEIAMpAwA3AwAgBSAJKQMANwMAIAIgAikDmAE3A4gEQdQAQQQQoQEiA0UNDiADQQA2AgAgAyACKQPwAjcCBCADIAIpA4gENwIUIANBDGogCikDADcCACADQRxqIAUpAwA3AgAgA0EkaiAEKQMANwIAIANBLGogCCkDADcCACADQTRqIAcpAwA3AgAgA0E8aiAMKQMANwIAIANBxABqIAspAwA3AgAgA0HMAGogBikDADcCAEGEgMAAIQRBAAwNCyACQZIEakIANwEAIAJBmgRqQQA7AQAgAkGcBGpCADcCACACQaQEakIANwIAIAJBrARqQgA3AgAgAkG0BGpCADcCACACQbwEakIANwIAIAJBxARqQQA6AAAgAkHFBGpBADYAACACQckEakEAOwAAIAJBywRqQQA6AAAgAkHAADYCiAQgAkEAOwGMBCACQQA2AY4EIAJBmAFqIAJBiARqQcQAEIsBGiACQagDaiIEIAJB1AFqKQIANwMAIAJBoANqIgUgAkHMAWopAgA3AwAgAkGYA2oiCSACQcQBaikCADcDACACQZADaiIKIAJBvAFqKQIANwMAIAJBiANqIgYgAkG0AWopAgA3AwAgAkGAA2oiByACQawBaikCADcDACACQfgCaiIIIAJBpAFqKQIANwMAIAIgAikCnAE3A/ACQeAAQQgQoQEiA0UNEyADQQA2AgggA0IANwMAIAMgAikD8AI3AgwgA0EUaiAIKQMANwIAIANBHGogBykDADcCACADQSRqIAYpAwA3AgAgA0EsaiAKKQMANwIAIANBNGogCSkDADcCACADQTxqIAUpAwA3AgAgA0HEAGogBCkDADcCACADQdQAakHIl8AAKQIANwIAIANBwJfAACkCADcCTEGsgMAAIQRBAAwMCyACQZIEakIANwEAIAJBmgRqQQA7AQAgAkGcBGpCADcCACACQaQEakIANwIAIAJBrARqQgA3AgAgAkG0BGpCADcCACACQbwEakIANwIAIAJBxARqQQA6AAAgAkHFBGpBADYAACACQckEakEAOwAAIAJBywRqQQA6AAAgAkHAADYCiAQgAkEAOwGMBCACQQA2AY4EIAJBmAFqIAJBiARqQcQAEIsBGiACQagDaiIEIAJB1AFqKQIANwMAIAJBoANqIgUgAkHMAWopAgA3AwAgAkGYA2oiCSACQcQBaikCADcDACACQZADaiIKIAJBvAFqKQIANwMAIAJBiANqIgYgAkG0AWopAgA3AwAgAkGAA2oiByACQawBaikCADcDACACQfgCaiIIIAJBpAFqKQIANwMAIAIgAikCnAE3A/ACQeAAQQgQoQEiA0UNEiADQgA3AwAgA0EANgIcIAMgAikD8AI3AyAgA0H4l8AAKQMANwMIIANBEGpBgJjAACkDADcDACADQRhqQYiYwAAoAgA2AgAgA0EoaiAIKQMANwMAIANBMGogBykDADcDACADQThqIAYpAwA3AwAgA0FAayAKKQMANwMAIANByABqIAkpAwA3AwAgA0HQAGogBSkDADcDACADQdgAaiAEKQMANwMAQYSBwAAhBEEADAsLIAJBkgRqQgA3AQAgAkGaBGpBADsBACACQZwEakIANwIAIAJBpARqQgA3AgAgAkGsBGpCADcCACACQbQEakIANwIAIAJBvARqQgA3AgAgAkHEBGpBADoAACACQcUEakEANgAAIAJByQRqQQA7AAAgAkHLBGpBADoAACACQcAANgKIBCACQQA7AYwEIAJBADYBjgQgAkGYAWogAkGIBGpBxAAQiwEaIAJBqANqIgQgAkHUAWopAgA3AwAgAkGgA2oiBSACQcwBaikCADcDACACQZgDaiIJIAJBxAFqKQIANwMAIAJBkANqIgogAkG8AWopAgA3AwAgAkGIA2oiBiACQbQBaikCADcDACACQYADaiIHIAJBrAFqKQIANwMAIAJB+AJqIgggAkGkAWopAgA3AwAgAiACKQKcATcD8AJB+ABBCBChASIDRQ0MIANCADcDACADQQA2AjAgAyACKQPwAjcCNCADQdCXwAApAwA3AwggA0EQakHYl8AAKQMANwMAIANBGGpB4JfAACkDADcDACADQSBqQeiXwAApAwA3AwAgA0EoakHwl8AAKQMANwMAIANBPGogCCkDADcCACADQcQAaiAHKQMANwIAIANBzABqIAYpAwA3AgAgA0HUAGogCikDADcCACADQdwAaiAJKQMANwIAIANB5ABqIAUpAwA3AgAgA0HsAGogBCkDADcCAEG0gcAAIQRBAAwKCyACQZIEakIANwEAIAJBmgRqQQA7AQAgAkGcBGpCADcCACACQaQEakIANwIAIAJBrARqQgA3AgAgAkG0BGpCADcCACACQbwEakIANwIAIAJBxARqQQA6AAAgAkHFBGpBADYAACACQckEakEAOwAAIAJBywRqQQA6AAAgAkHAADYCiAQgAkEAOwGMBCACQQA2AY4EIAJBmAFqIAJBiARqQcQAEIsBGiACQagDaiIEIAJB1AFqKQIANwMAIAJBoANqIgUgAkHMAWopAgA3AwAgAkGYA2oiCSACQcQBaikCADcDACACQZADaiIKIAJBvAFqKQIANwMAIAJBiANqIgYgAkG0AWopAgA3AwAgAkGAA2oiByACQawBaikCADcDACACQfgCaiIIIAJBpAFqKQIANwMAIAIgAikCnAE3A/ACQfAAQQgQoQEiA0UNESADQQA2AgggA0IANwMAIAMgAikD8AI3AgwgA0EUaiAIKQMANwIAIANBHGogBykDADcCACADQSRqIAYpAwA3AgAgA0EsaiAKKQMANwIAIANBNGogCSkDADcCACADQTxqIAUpAwA3AgAgA0HEAGogBCkDADcCACADQeQAakGkmMAAKQIANwIAIANB3ABqQZyYwAApAgA3AgAgA0HUAGpBlJjAACkCADcCACADQYyYwAApAgA3AkxBiILAACEEQQAMCQsgAkGSBGpCADcBACACQZoEakEAOwEAIAJBnARqQgA3AgAgAkGkBGpCADcCACACQawEakIANwIAIAJBtARqQgA3AgAgAkG8BGpCADcCACACQcQEakEAOgAAIAJBxQRqQQA2AAAgAkHJBGpBADsAACACQcsEakEAOgAAIAJBwAA2AogEIAJBADsBjAQgAkEANgGOBCACQZgBaiACQYgEakHEABCLARogAkGoA2oiBCACQdQBaikCADcDACACQaADaiIFIAJBzAFqKQIANwMAIAJBmANqIgkgAkHEAWopAgA3AwAgAkGQA2oiCiACQbwBaikCADcDACACQYgDaiIGIAJBtAFqKQIANwMAIAJBgANqIgcgAkGsAWopAgA3AwAgAkH4AmoiCCACQaQBaikCADcDACACIAIpApwBNwPwAkHwAEEIEKEBIgNFDRAgA0EANgIIIANCADcDACADIAIpA/ACNwIMIANBFGogCCkDADcCACADQRxqIAcpAwA3AgAgA0EkaiAGKQMANwIAIANBLGogCikDADcCACADQTRqIAkpAwA3AgAgA0E8aiAFKQMANwIAIANBxABqIAQpAwA3AgAgA0HkAGpBxJjAACkCADcCACADQdwAakG8mMAAKQIANwIAIANB1ABqQbSYwAApAgA3AgAgA0GsmMAAKQIANwJMQbSCwAAhBEEADAgLIAJBADYCiAQgAkGIBGpBBHIhBEEAIQMDQCADIARqQQA6AAAgAiACKAKIBEEBajYCiAQgA0EBaiIDQYABRw0ACyACQZgBaiACQYgEakGEARCLARogAkHwAmogAkGYAWpBBHJBgAEQiwEaQdgBQQgQoQEiA0UNECADQgA3AwggA0IANwMAIANBADYCUCADQdCYwAApAwA3AxAgA0EYakHYmMAAKQMANwMAIANBIGpB4JjAACkDADcDACADQShqQeiYwAApAwA3AwAgA0EwakHwmMAAKQMANwMAIANBOGpB+JjAACkDADcDACADQUBrQYCZwAApAwA3AwAgA0HIAGpBiJnAACkDADcDACADQdQAaiACQfACakGAARCLARpB4ILAACEEQQAMBwsgAkGYAWpBAEHIARCRARogAkEANgLwAkEEIQMDQCACQfACaiADakEAOgAAIAIgAigC8AJBAWo2AvACIANBAWoiA0GUAUcNAAsgAkGIBGogAkHwAmpBlAEQiwEaIAJBCGogAkGIBGpBBHJBkAEQiwEaQeACQQgQoQEiA0UNECADIAJBmAFqQcgBEIsBIgRBADYCyAEgBEHMAWogAkEIakGQARCLARpBuIPAACEEQQAMBgsgAkGYAWpBAEHIARCRARogAkEANgLwAkEEIQMDQCACQfACaiADakEAOgAAIAIgAigC8AJBAWo2AvACIANBAWoiA0GMAUcNAAsgAkGIBGogAkHwAmpBjAEQiwEaIAJBCGogAkGIBGpBBHJBiAEQiwEaQdgCQQgQoQEiA0UNECADIAJBmAFqQcgBEIsBIgRBADYCyAEgBEHMAWogAkEIakGIARCLARpB5IPAACEEQQAMBQsgAkGYAWpBAEHIARCRARogAkEANgLwAkEEIQMDQCACQfACaiADakEAOgAAIAIgAigC8AJBAWo2AvACIANBAWoiA0HsAEcNAAsgAkGIBGogAkHwAmpB7AAQiwEaIAJBCGogAkGIBGpBBHJB6AAQiwEaQbgCQQgQoQEiA0UNECADIAJBmAFqQcgBEIsBIgRBADYCyAEgBEHMAWogAkEIakHoABCLARpBkITAACEEQQAMBAsgAkGYAWpBAEHIARCRARogAkEA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aiIBIAIgBHNzakHglu21f2pBEHcgAWoiAyABcyACIApqIAEgBHMgA3NqQfD4/vV7akEXdyADaiICc2pBxv3txAJqQQR3IAJqIgRqIAMgC2ogASATaiACIANzIARzakH6z4TVfmpBC3cgBGoiASACIARzc2pBheG8p31qQRB3IAFqIgMgAXMgAiAGaiABIARzIANzakGFuqAkakEXdyADaiICc2pBuaDTzn1qQQR3IAJqIgRqIAIgDGogASAJaiACIANzIARzakHls+62fmpBC3cgBGoiASAEcyADIBJqIAIgBHMgAXNqQfj5if0BakEQdyABaiICc2pB5ayxpXxqQRd3IAJqIgMgAUF/c3IgAnNqQcTEpKF/akEGdyADaiIEaiADIBVqIAIgCGogASAOaiAEIAJBf3NyIANzakGX/6uZBGpBCncgBGoiASADQX9zciAEc2pBp8fQ3HpqQQ93IAFqIgIgBEF/c3IgAXNqQbnAzmRqQRV3IAJqIgMgAUF/c3IgAnNqQcOz7aoGakEGdyADaiIEaiADIBRqIAIgCmogASALaiAEIAJBf3NyIANzakGSmbP4eGpBCncgBGoiASADQX9zciAEc2pB/ei/f2pBD3cgAWoiAiAEQX9zciABc2pB0buRrHhqQRV3IAJqIgMgAUF/c3IgAnNqQc/8of0GakEGdyADaiIEaiADIBFqIAIgBmogASASaiAEIAJBf3NyIANzakHgzbNxakEKdyAEaiIBIANBf3NyIARzakGUhoWYempBD3cgAWoiAiAEQX9zciABc2pBoaOg8ARqQRV3IAJqIgMgAUF/c3IgAnNqQYL9zbp/akEGdyADaiIEIAAoAgBqNgIAIAAgASAQaiAEIAJBf3NyIANzakG15Ovpe2pBCncgBGoiASAAKAIMajYCDCAAIAIgDGogASADQX9zciAEc2pBu6Xf1gJqQQ93IAFqIgIgACgCCGo2AgggACACIAAoAgRqIAMgD2ogAiAEQX9zciABc2pBkaeb3H5qQRV3ajYCBAvcDwEFfyAAIAEtAAAiAzoAECAAIAEtAAEiAjoAESAAIAEtAAIiBDoAEiAAIAEtAAMiBToAEyAAIAEtAAQiBjoAFCAAIAMgAC0AAHM6ACAgACACIAAtAAFzOgAhIAAgBCAALQACczoAIiAAIAUgAC0AA3M6ACMgACAGIAAt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BCARIAEgA0F/c3EgAyAEcXIgAmpqQQd3IgVBf3NxIAMgBXFyIAFqakELdyIBIAVyIBIgBCABIAVxIgQgAyABQX9zcXJqakETdyICcSAEcmogFGpBmfOJ1AVqQQN3IgMgByABIAUgAyABIAJycSABIAJxcmogDWpBmfOJ1AVqQQV3IgQgAiADcnEgAiADcXJqakGZ84nUBWpBCXciASAEciAJIAIgASADIARycSADIARxcmpqQZnzidQFakENdyICcSABIARxcmogDGpBmfOJ1AVqQQN3IgMgDyABIAQgAyABIAJycSABIAJxcmogFWpBmfOJ1AVqQQV3IgQgAiADcnEgAiADcXJqakGZ84nUBWpBCXciASAEciARIAIgASADIARycSADIARxcmpqQZnzidQFakENdyICcSABIARxcmogC2pBmfOJ1AVqQQN3IgMgCiABIAYgBCADIAEgAnJxIAEgAnFyampBmfOJ1AVqQQV3IgQgAiADcnEgAiADcXJqakGZ84nUBWpBCXciASAEciAIIAIgASADIARycSADIARxcmpqQZnzidQFakENdyICcSABIARxcmogE2pBmfOJ1AVqQQN3IgMgEiACIBAgASAOIAQgAyABIAJycSABIAJxcmpqQZnzidQFakEFdyIEIAIgA3JxIAIgA3FyampBmfOJ1AVqQQl3IgUgAyAEcnEgAyAEcXJqakGZ84nUBWpBDXciAyAFcyICIARzaiAUakGh1+f2BmpBA3ciASAJIAMgASAHIAQgASACc2pqQaHX5/YGakEJdyICcyAFIA1qIAEgA3MgAnNqQaHX5/YGakELdyIEc2pqQaHX5/YGakEPdyIDIARzIgUgAnNqIAtqQaHX5/YGakEDdyIBIAggAyABIAogAiABIAVzampBodfn9gZqQQl3IgJzIAQgBmogASADcyACc2pBodfn9gZqQQt3IgRzampBodfn9gZqQQ93IgMgBHMiBSACc2ogDGpBodfn9gZqQQN3IgEgESADIAEgDyACIAEgBXNqakGh1+f2BmpBCXciAnMgBCAVaiABIANzIAJzakGh1+f2BmpBC3ciBHNqakGh1+f2BmpBD3ciAyAEcyIFIAJzaiATakGh1+f2BmpBA3ciASAAKAIAajYCACAAIBAgAiABIAVzampBodfn9gZqQQl3IgIgACgCDGo2Agwg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IgVFDQULIAIgBDYCFCACIAU2AhALIAIoAhAhBSACQThqIgZCADcDACACQTBqIgdCADcDACACQShqIghCADcDACACQSBqIglCADcDACACQRhqIgpCADcDACACQgA3AxAgAkHqAGpCADcBACACQfIAakEAOwEAIAJBEDYCYCACQQA7AWQgAkEANgFmIAJBiAFqIAJB8ABqKAIANgIAIAJBgAFqIAJB6ABqKQMANwMAIAJB2ABqIgsgAkGEAWopAgA3AwAgAiACKQNgNwN4IAIgAikCfDcDUCACQcgAaiIMIAspAwA3AwAgAiACKQNQNwNAIANBOGogDCkDADcAACADQTBqIAIpA0A3AAAgA0EoaiAGKQMANwAAIANBIGogBykDADcAACADQRhqIAgpAwA3AAAgA0EQaiAJKQMANwAAIANBCGogCikDADcAACADIAIpAxA3AAAgAUEANgIAIAAgBDYCBCAAIAU2AgAgAkGQAWokAA8LQbCawABBFyACQRBqQaCXwABBsJfAABB5AAtBEEEBQbSlwAAoAgAiAEECIAAbEQAAAAtBh4zAAEEkQayMwAAQiAEACyAEQQFBtKXAACgCACIAQQIgABsRAAAAC9gIAQV/IABBeGoiASAAQXxqKAIAIgNBeHEiAGohAgJAAkACQAJAIANBAXENACADQQNxRQ0BIAEoAgAiAyAAaiEAIAEgA2siAUH8pMAAKAIARgRAIAIoAgRBA3FBA0cNAUH0pMAAIAA2AgAgAiACKAIEQX5xNgIEIAEgAEEBcjYCBCAAIAFqIAA2AgAPCyABIAMQTAsCQCACQQRqIgQoAgAiA0ECcQRAIAQgA0F+cTYCACABIABBAXI2AgQgACABaiAANgIADAELAkAgAkGApcAAKAIARwRAQfykwAAoAgAgAkYNASACIANBeHEiAhBMIAEgACACaiIAQQFyNgIEIAAgAWogADYCACABQfykwAAoAgBHDQJB9KTAACAANgIADwtBgKXAACABNgIAQfikwABB+KTAACgCACAAaiIANgIAIAEgAEEBcjYCBEH8pMAAKAIAIAFGBEBB9KTAAEEANgIAQfykwABBADYCAAtBnKXAACgCACICIABPDQJBgKXAACgCACIARQ0CAkBB+KTAACgCACIDQSlJDQBBjKXAACEBA0AgASgCACIEIABNBEAgBCABKAIE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KQMwNwNoIAJBIGogAkGMAWopAgA3AwAgAkEYaiACQYQBaikCADcDACACQRBqIAJB/ABqKQIANwMAIAJBCGogAkH0AGopAgA3AwAgAkEoaiACQZQBaikCADcDACACIAIpAmw3AwAgASACEB8gAUIANwMIIAFCADcDACABQQA2AlAgAUHQmMAAKQMANwMQIAFBGGpB2JjAACkDADcDACABQSBqQeCYwAApAwA3AwAgAUEoakHomMAAKQMANwMAIAFBMGpB8JjAACkDADcDACABQThqQfiYwAApAwA3AwAgAUFAa0GAmcAAKQMANwMAIAFByABqQYiZwAApAwA3AwACQAJAQTBBARChASIDBEAgAkIwNwJsIAIgAzYCaCACQegAaiACQTAQXgJAIAIoAmwiBCACKAJwIgNGBEAgBCEDDAELIAQgA0kNAiAERQ0AIAIoAmghBQJAIANFBEAgBRAQQQEhBAwBCyAFIARBASADEJoBIgRFDQQLIAIgAzYCbCACIAQ2AmgLIAIoAmghBCABQgA3AwggAUIANwMAIAFBADYCUCABQRBqIgFB0JjAACkDADcDACABQQhqQdiYwAApAwA3AwAgAUEQakHgmMAAKQMANwMAIAFBGGpB6JjAACkDADcDACABQSBqQfCYwAApAwA3AwAgAUEoakH4mMAAKQMANwMAIAFBMGpBgJnAACkDADcDACABQThqQYiZwAApAwA3AwAgACADNgIEIAAgBDYCACACQaABaiQADwtBMEEBQbSlwAAoAgAiAEECIAAbEQAAAAtBh4zAAEEkQayMwAAQiAEACyADQQFBtKXAACgCACIAQQIgABsRAAAAC78GAQR/IAAgAWohAgJAAkACQAJAAkAgAEEEaigCACIDQQFxDQAgA0EDcUUNASAAKAIAIgMgAWohASAAIANrIgBB/KTAACgCAEYEQCACKAIEQQNxQQNHDQFB9KTAACABNgIAIAIgAigCBEF+cTYCBCAAIAFBAXI2AgQgAiABNgIADwsgACADEEwLAkAgAkEEaigCACIDQQJxBEAgAkEEaiADQX5xNgIAIAAgAUEBcjYCBCAAIAFqIAE2AgAMAQsCQCACQYClwAAoAgBHBEBB/KTAACgCACACRg0BIAIgA0F4cSICEEwgACABIAJqIgFBAXI2AgQgACABaiABNgIAIABB/KTAACgCAEcNAkH0pMAAIAE2AgAPC0GApcAAIAA2AgBB+KTAAEH4pMAAKAIAIAFqIgE2AgAgACABQQFyNgIEIABB/KTAACgCAEcNAkH0pMAAQQA2AgBB/KTAAEEANgIADwtB/KTAACAANgIAQfSkwABB9KTAACgCACABaiIBNgIAIAAgAUEBcjYCBCAAIAFqIAE2AgAPCyABQYACSQ0DIABCADcCECAAQRxqAn9BACABQQh2IgNFDQAaQR8gAUH///8HSw0AGiABQQYgA2ciAmtBH3F2QQFxIAJBAXRrQT5qCyICNgIAIAJBAnRB9KPAAGohAwJAAkBB6KHAACgCACIEQQEgAkEfcXQiBXEEQCADKAIAIgNBBGooAgBBeHEgAUcNASADIQIMAgtB6KHAACAEIAVyNgIAIAMgADYCAAwECyABQQBBGSACQQF2a0EfcSACQR9GG3QhBANAIAMgBEEddkEEcWpBEGoiBSgCACICRQ0DIARBAXQhBCACIQMgAkEEaigCAEF4cSABRw0ACwsgAigCCCIBIAA2AgwgAiAANgIIIABBGGpBADYCACAAIAI2AgwgACABNgIICw8LIAUgADYCAAsgAEEYaiADNgIAIAAgADYCDCAAIAA2AggPCyABQQN2IgJBA3RB7KHAAGohAQJ/QeShwAAoAgAiA0EBIAJ0IgJxBEAgASgCCAwBC0HkocAAIAIgA3I2AgAgAQshAiABIAA2AgggAiAANgIMIAAgATYCDCAAIAI2AggL1AYBBH8jAEHQAWsiAiQAIAJBygBqQgA3AQAgAkHSAGpBADsBACACQdQAakIANwIAIAJB3ABqQgA3AgAgAkHkAGpCADcCACACQewAakIANwIAIAJB9ABqQgA3AgAgAkH8AGpBADoAACACQf0AakEANgAAIAJBgQFqQQA7AAAgAkGDAWpBADoAACACQQA7AUQgAkEANgFGIAJBwAA2AkAgAkGIAWogAkFAa0HEABCLARogAkE4aiACQcQBaikCADcDACACQTBqIAJBvAFqKQIANwMAIAJBKGogAkG0AWopAgA3AwAgAkEgaiACQawBaikCADcDACACQRhqIAJBpAFqKQIANwMAIAJBEGogAkGcAWopAgA3AwAgAkEIaiACQZQBaikCADcDACACIAIpAowBNwMAIAEgAhARIAFCADcDCCABQgA3AwAgAUEANgJQIAFBkJnAACkDADcDECABQRhqQZiZwAApAwA3AwAgAUEgakGgmcAAKQMANwMAIAFBKGpBqJnAACkDADcDACABQTBqQbCZwAApAwA3AwAgAUE4akG4mcAAKQMANwMAIAFBQGtBwJnAACkDADcDACABQcgAakHImcAAKQMANwMAAkACQEHAAEEBEKEBIgMEQCACQsAANwKMASACIAM2AogBIAJBiAFqIAJBwAAQXgJAIAIoAowBIgQgAigCkAEiA0YEQCAEIQMMAQsgBCADSQ0CIARFDQAgAigCiAEhBQJAIANFBEAgBRAQQQEhBAwBCyAFIARBASADEJoBIgRFDQQLIAIgAzYCjAEgAiAENgKIAQsgAigCiAEhBCABQgA3AwggAUIANwMAIAFBADYCUCABQRBqIgFBkJnAACkDADcDACABQQhqQZiZwAApAwA3AwAgAUEQakGgmcAAKQMANwMAIAFBGGpBqJnAACkDADcDACABQSBqQbCZwAApAwA3AwAgAUEoakG4mcAAKQMANwMAIAFBMGpBwJnAACkDADcDACABQThqQciZwAApAwA3AwAgACADNgIEIAAgBDYCACACQdABaiQADwtBwABBAUG0pcAAKAIAIgBBAiAAGxEAAAALQYeMwABBJEGsjMAAEIgBAAsgA0EBQbSlwAAoAgAiAEECIAAbEQAAAAuOBgEKfyMAQTBrIgIkACACQSRqQYCHwAA2AgAgAkEDOgAoIAJCgICAgIAENwMIIAIgADYCICACQQA2AhggAkEANgIQAn8CQAJAAkAgASgCCCIDBEAgASgCACEFIAEoAgQiCCABQQxqKAIAIgYgBiAISxsiBkUNASABQRRqKAIAIQcgASgCECEJIAAgBSgCACAFKAIEQYyHwAAoAgARAwANAyAFQQhqIQECQAJAA0AgAiADQQRqKAIANgIMIAIgA0Ecai0AADoAKCACIANBCGooAgA2AgggA0EYaigCACEAQQAhBAJAAkACQCADQRRqKAIAQQFrDgIAAgELIAAgB08NAyAAQQN0IAlqIgooAgRBA0cNASAKKAIAKAIAIQALQQEhBAsgAiAANgIUIAIgBDYCECADQRBqKAIAIQBBACEEAkACQAJAIANBDGooAgBBAWsOAgACAQsgACAHTw0EIABBA3QgCWoiCigCBEEDRw0BIAooAgAoAgAhAAtBASEECyACIAA2AhwgAiAENgIYIAMoAgAiACAHSQRAIAkgAEEDdGoiACgCACACQQhqIAAoAgQRAQANByALQQFqIgsgBk8NBiADQSBqIQMgAUEEaiEAIAEoAgAhBCABQQhqIQEgAigCICAEIAAoAgAgAigCJCgCDBEDAEUNAQwHCwsgACAHQaCLwAAQfAALIAAgB0GQi8AAEHwACyAAIAdBkIvAABB8AAsgASgCACEFIAEoAgQiCCABQRRqKAIAIgMgAyAISxsiBkUNACABKAIQIQMgACAFKAIAIAUoAgRBjIfAACgCABEDAA0CIAVBCGohAUEAIQADQCADKAIAIAJBCGogA0EEaigCABEBAA0DIABBAWoiACAGTw0CIANBCGohAyABQQRqIQcgASgCACEEIAFBCGohASACKAIgIAQgBygCACACKAIkKAIMEQMARQ0ACwwCC0EAIQYLIAggBksEQCACKAIgIAUgBkEDdGoiACgCACAAKAIEIAIoAiQoAgwRAwANAQtBAAwBC0EBCyACQTBqJAALwQUBBX8CQAJAAkACQCACQQlPBEAgAiADEEYiAg0BQQAPC0EAIQIgA0HM/3tLDQJBECADQQtqQXhxIANBC0kbIQEgAEF8aiIFKAIAIgZBeHEhBAJAAkACQAJAIAZBA3EEQCAAQXhqIgcgBGohCCAEIAFPDQFBgKXAACgCACAIRg0CQfykwAAoAgAgCEYNAyAIQQRqKAIAIgZBAnENBiAGQXhxIgYgBGoiBCABTw0EDAYLIAFBgAJJIAQgAUEEcklyIAQgAWtBgYAIT3INBQwHCyAEIAFrIgJBEEkNBiAFIAEgBkEBcXJBAnI2AgAgASAHaiIBIAJBA3I2AgQgCCAIKAIEQQFyNgIEIAEgAhAUDAYLQfikwAAoAgAgBGoiBCABTQ0DIAUgASAGQQFxckECcjYCACABIAdqIgIgBCABayIBQQFyNgIEQfikwAAgATYCAEGApcAAIAI2AgAMBQtB9KTAACgCACAEaiIEIAFJDQICQCAEIAFrIgNBD00EQCAFIAZBAXEgBHJBAnI2AgAgBCAHaiIBIAEoAgRBAXI2AgRBACEDDAELIAUgASAGQQFxckECcjYCACABIAdqIgIgA0EBcjYCBCAEIAdqIgEgAzYCACABIAEoAgRBfnE2AgQLQfykwAAgAjYCAEH0pMAAIAM2AgAMBAsgCCAGEEwgBCABayICQRBPBEAgBSABIAUoAgBBAXFyQQJyNgIAIAEgB2oiASACQQNyNgIEIAQgB2oiAyADKAIEQQFyNgIEIAEgAhAUDAQLIAUgBCAFKAIAQQFxckECcjYCACAEIAdqIgEgASgCBEEBcjYCBAwDCyACIAAgAyABIAEgA0sbEIsBGiAAEBAMAQsgAxAJIgFFDQAgASAAIAMgBSgCACIBQXhxQQRBCCABQQNxG2siASABIANLGxCLASAAEBAPCyACDwsgAAvYBQEGfyAAKAIAIglBAXEiCiAEaiEIAkAgCUEEcUUEQEEAIQEMAQsgAgRAIAIhByABIQUDQCAGIAUtAABBwAFxQYABRmohBiAFQQFqIQUgB0F/aiIHDQALCyACIAhqIAZrIQgLQStBgIDEACAKGyEGAkAgACgCCEEBRwRAQQEhBSAAIAYgASACEIYBDQEgACgCGCADIAQgAEEcaigCACgCDBEDACEFDAELIABBDGooAgAiByAITQRAQQEhBSAAIAYgASACEIYBDQEgACgCGCADIAQgAEEcaigCACgCDBEDAA8LAkAgCUEIcUUEQEEAIQUgByAIayIHIQgCQAJAAkBBASAALQAgIgkgCUEDRhtBAWsOAwEAAQILIAdBAXYhBSAHQQFqQQF2IQgMAQtBACEIIAchBQsgBUEBaiEFA0AgBUF/aiIFRQ0CIAAoAhggACgCBCAAKAIcKAIQEQEARQ0AC0EBDwsgACgCBCEJIABBMDYCBCAALQAgIQpBASEFIABBAToAICAAIAYgASACEIYBDQFBACEFIAcgCGsiASECAkACQAJAQQEgAC0AICIHIAdBA0YbQQFrDgMBAAECCyABQQF2IQUgAUEBakEBdiECDAELQQAhAiABIQULIAVBAWohBQJAA0AgBUF/aiIFRQ0BIAAoAhggACgCBCAAKAIcKAIQEQEARQ0AC0EBDwsgACgCBCEBQQEhBSAAKAIYIAMgBCAAKAIcKAIMEQMADQEgAkEBaiEGIAAoAhwhAiAAKAIYIQMDQCAGQX9qIgYEQCADIAEgAigCEBEBAEUNAQwDCwsgACAKOgAgIAAgCTYCBEEADwsgACgCBCEHQQEhBSAAIAYgASACEIYBDQAgACgCGCADIAQgACgCHCgCDBEDAA0AIAhBAWohBiAAKAIcIQEgACgCGCEAA0AgBkF/aiIGRQRAQQAPCyAAIAcgASgCEBEBAEUNAAsLIAULtwUBBH8jAEGQAWsiAiQAIAJBOmpCADcBACACQcIAakEAOwEAIAJBxABqQgA3AgAgAkHMAGpCADcCACACQdQAakIANwIAIAJBADsBNCACQQA2ATYgAkEoNgIwIAJBgAFqIAJB0ABqKQMANwMAIAJB+ABqIAJByABqKQMANwMAIAJB8ABqIAJBQGspAwA3AwAgAkHoAGogAkE4aikDADcDACACQYgBaiACQdgAaigCADYCACACIAIpAzA3A2AgAkEgaiACQfwAaikCADcDACACQRhqIAJB9ABqKQIANwMAIAJBEGogAkHsAGopAgA3AwAgAkEoaiACQYQBaikCADcDACACIAIpAmQ3AwggASACQQhqEE0gAUIANwMAIAFBADYCMCABQdCXwAApAwA3AwggAUEQakHYl8AAKQMANwMAIAFBGGpB4JfAACkDADcDACABQSBqQeiXwAApAwA3AwAgAUEoakHwl8AAKQMANwMAAkACQEEoQQEQoQEiAwRAIAJCKDcCZCACIAM2AmAgAkHgAGogAkEIakEoEF4CQCACKAJkIgQgAigCaCIDRgRAIAQhAwwBCyAEIANJDQIgBEUNACACKAJgIQUCQCADRQRAIAUQEEEBIQQMAQsgBSAEQQEgAxCaASIERQ0ECyACIAM2AmQgAiAENgJgCyACKAJgIQQgAUIANwMAIAFBADYCMCABQQhqIgFB0JfAACkDADcDACABQQhqQdiXwAApAwA3AwAgAUEQakHgl8AAKQMANwMAIAFBGGpB6JfAACkDADcDACABQSBqQfCXwAApAwA3AwAgACADNgIEIAAgBDYCACACQZABaiQADwtBKEEBQbSlwAAoAgAiAEECIAAbEQAAAAtBh4zAAEEkQayMwAAQiAEACyADQQFBtKXAACgCACIAQQIgABsRAAAAC8YEAQR/IwBBoAFrIgIkACACQTpqQgA3AQAgAkHCAGpBADsBACACQcQAakIANwIAIAJBzABqQgA3AgAgAkHUAGpCADcCACACQdwAakIANwIAIAJBADsBNCACQQA2ATYgAkEwNgIwIAJBkAFqIAJB2ABqKQMANwMAIAJBiAFqIAJB0ABqKQMANwMAIAJBgAFqIAJByABqKQMANwMAIAJB+ABqIAJBQGspAwA3AwAgAkHwAGogAkE4aikDADcDACACQZgBaiACQeAAaigCADYCACACIAIpAzA3A2ggAkEgaiACQYwBaikCADcDACACQRhqIAJBhAFqKQIANwMAIAJBEGogAkH8AGopAgA3AwAgAkEIaiACQfQAaikCADcDACACQShqIAJBlAFqKQIANwMAIAIgAikCbDcDACABIAIQYyABQQBByAEQkQEiBUEANgLIAQJAAkBBMEEBEKEBIgEEQCACQjA3AmwgAiABNgJoIAJB6ABqIAJBMBBeAkAgAigCbCIDIAIoAnAiAUYEQCADIQEMAQsgAyABSQ0CIANFDQAgAigCaCEEAkAgAUUEQCAEEBBBASEDDAELIAQgA0EBIAEQmgEiA0UNBAsgAiABNgJsIAIgAzYCaAsgAigCaCEDIAVBAEHIARCRAUEANgLIASAAIAE2AgQgACADNgIAIAJBoAFqJAAPC0EwQQFBtKXAACgCACIAQQIgABsRAAAAC0GHjMAAQSRBrIzAABCIAQALIAFBAUG0pcAAKAIAIgBBAiAAGxEAAAALxgQBBH8jAEGgAWsiAiQAIAJBOmpCADcBACACQcIAakEAOwEAIAJBxABqQgA3AgAgAkHMAGpCADcCACACQdQAakIANwIAIAJB3ABqQgA3AgAgAkEAOwE0IAJBADYBNiACQTA2AjAgAkGQAWogAkHYAGopAwA3AwAgAkGIAWogAkHQAGopAwA3AwAgAkGAAWogAkHIAGopAwA3AwAgAkH4AGogAkFAaykDADcDACACQfAAaiACQThqKQMANwMAIAJBmAFqIAJB4ABqKAIANgIAIAIgAikDMDcDaCACQSBqIAJBjAFqKQIANwMAIAJBGGogAkGEAWopAgA3AwAgAkEQaiACQfwAaikCADcDACACQQhqIAJB9ABqKQIANwMAIAJBKGogAkGUAWopAgA3AwAgAiACKQJsNwMAIAEgAhBkIAFBAEHIARCRASIFQQA2AsgBAkACQEEwQQEQoQEiAQRAIAJCMDcCbCACIAE2AmggAkHoAGogAkEwEF4CQCACKAJsIgMgAigCcCIBRgRAIAMhAQwBCyADIAFJDQIgA0UNACACKAJoIQQCQCABRQRAIAQQEEEBIQMMAQsgBCADQQEgARCaASIDRQ0ECyACIAE2AmwgAiADNgJoCyACKAJoIQMgBUEAQcgBEJEBQQA2AsgBIAAgATYCBCAAIAM2AgAgAkGgAWokAA8LQTBBAUG0pcAAKAIAIgBBAiAAGxEAAAALQYeMwABBJEGsjMAAEIgBAAsgAUEBQbSlwAAoAgAiAEECIAAbEQAAAAu8BAEEfyMAQaADayICJAAgAkHyAmpCADcBACACQfoCakEAOwEAIAJB/AJqQgA3AgAgAkGEA2pCADcCACACQYwDakIANwIAIAJBlANqQgA3AgAgAkEAOwHsAiACQQA2Ae4CIAJBMDYC6AIgAkHYAGogAkGQA2opAwA3AwAgAkHQAGogAkGIA2opAwA3AwAgAkHIAGogAkGAA2opAwA3AwAgAkFAayACQfgCaikDADcDACACQThqIAJB8AJqKQMANwMAIAJB4ABqIAJBmANqKAIANgIAIAIgAikD6AI3AzAgAkEgaiACQdQAaikCADcDACACQRhqIAJBzABqKQIANwMAIAJBEGogAkHEAGopAgA3AwAgAkEIaiACQTxqKQIANwMAIAJBKGogAkHcAGopAgA3AwAgAiACKQI0NwMAIAJBMGogAUG4AhCLARogAkEwaiACEGMCQAJAQTBBARChASIDBEAgAkIwNwI0IAIgAzYCMCACQTBqIAJBMBBeAkAgAigCNCIEIAIoAjgiA0YEQCAEIQMMAQsgBCADSQ0CIARFDQAgAigCMCEFAkAgA0UEQCAFEBBBASEEDAELIAUgBEEBIAMQmgEiBEUNBAsgAiADNgI0IAIgBDYCMAsgAigCMCEEIAEQECAAIAM2AgQgACAENgIAIAJBoANqJAAPC0EwQQFBtKXAACgCACIAQQIgABsRAAAAC0GHjMAAQSRBrIzAABCIAQALIANBAUG0pcAAKAIAIgBBAiAAGxEAAAALvAQBBH8jAEGgA2siAiQAIAJB8gJqQgA3AQAgAkH6AmpBADsBACACQfwCakIANwIAIAJBhANqQgA3AgAgAkGMA2pCADcCACACQZQDakIANwIAIAJBADsB7AIgAkEANgHuAiACQTA2AugCIAJB2ABqIAJBkANqKQMANwMAIAJB0ABqIAJBiANqKQMANwMAIAJByABqIAJBgANqKQMANwMAIAJBQGsgAkH4AmopAwA3AwAgAkE4aiACQfACaikDADcDACACQeAAaiACQZgDaigCADYCACACIAIpA+gCNwMwIAJBIGogAkHUAGopAgA3AwAgAkEYaiACQcwAaikCADcDACACQRBqIAJBxABqKQIANwMAIAJBCGogAkE8aikCADcDACACQShqIAJB3ABqKQIANwMAIAIgAikCNDcDACACQTBqIAFBuAIQiwEaIAJBMGogAhBkAkACQEEwQQEQoQEiAwRAIAJCMDcCNCACIAM2AjAgAkEwaiACQTAQXgJAIAIoAjQiBCACKAI4IgNGBEAgBCEDDAELIAQgA0kNAiAERQ0AIAIoAjAhBQJAIANFBEAgBRAQQQEhBAwBCyAFIARBASADEJoBIgRFDQQLIAIgAzYCNCACIAQ2AjALIAIoAjAhBCABEBAgACADNgIEIAAgBDYCACACQaADaiQADwtBMEEBQbSlwAAoAgAiAEECIAAbEQAAAAtBh4zAAEEkQayMwAAQiAEACyADQQFBtKXAACgCACIAQQIgABsRAAAAC7wEAQR/IwBBwAJrIgIkACACQZICakIANwEAIAJBmgJqQQA7AQAgAkGcAmpCADcCACACQaQCakIANwIAIAJBrAJqQgA3AgAgAkG0AmpCADcCACACQQA7AYwCIAJBADYBjgIgAkEwNgKIAiACQdgAaiACQbACaikDADcDACACQdAAaiACQagCaikDADcDACACQcgAaiACQaACaikDADcDACACQUBrIAJBmAJqKQMANwMAIAJBOGogAkGQAmopAwA3AwAgAkHgAGogAkG4AmooAgA2AgAgAiACKQOIAjcDMCACQSBqIAJB1ABqKQIANwMAIAJBGGogAkHMAGopAgA3AwAgAkEQaiACQcQAaikCADcDACACQQhqIAJBPGopAgA3AwAgAkEoaiACQdwAaikCADcDACACIAIpAjQ3AwAgAkEwaiABQdgBEIsBGiACQTBqIAIQHwJAAkBBMEEBEKEBIgMEQCACQjA3AjQgAiADNgIwIAJBMGogAkEwEF4CQCACKAI0IgQgAigCOCIDRgRAIAQhAwwBCyAEIANJDQIgBEUNACACKAIwIQUCQCADRQRAIAUQEEEBIQQMAQsgBSAEQQEgAxCaASIERQ0ECyACIAM2AjQgAiAENgIwCyACKAIwIQQgARAQIAAgAzYCBCAAIAQ2AgAgAkHAAmokAA8LQTBBAUG0pcAAKAIAIgBBAiAAGxEAAAALQYeMwABBJEGsjMAAEIgBAAsgA0EBQbSlwAAoAgAiAEECIAAbEQAAAAuBBQEBfiAAEEAgASAAKQMQIgJCOIYgAkIohkKAgICAgIDA/wCDhCACQhiGQoCAgICA4D+DIAJCCIZCgICAgPAfg4SEIAJCCIhCgICA+A+DIAJCGIhCgID8B4OEIAJCKIhCgP4DgyACQjiIhISENwAAIAEgAEEYaikDACICQjiGIAJCKIZCgICAgICAwP8Ag4QgAkIYhkKAgICAgOA/gyACQgiGQoCAgIDwH4OEhCACQgiIQoCAgPgPgyACQhiIQoCA/AeDhCACQiiIQoD+A4MgAkI4iISEhDcACCABIABBIGopAwAiAkI4hiACQiiGQoCAgICAgMD/AIOEIAJCGIZCgICAgIDgP4MgAkIIhkKAgICA8B+DhIQgAkIIiEKAgID4D4MgAkIYiEKAgPwHg4QgAkIoiEKA/gODIAJCOIiEhIQ3ABAgASAAQShqKQMAIgJCOIYgAkIohkKAgICAgIDA/wCDhCACQhiGQoCAgICA4D+DIAJCCIZCgICAgPAfg4SEIAJCCIhCgICA+A+DIAJCGIhCgID8B4OEIAJCKIhCgP4DgyACQjiIhISENwAYIAEgAEEwaikDACICQjiGIAJCKIZCgICAgICAwP8Ag4QgAkIYhkKAgICAgOA/gyACQgiGQoCAgIDwH4OEhCACQgiIQoCAgPgPgyACQhiIQoCA/AeDhCACQiiIQoD+A4MgAkI4iISEhDcAICABIABBOGopAwAiAkI4hiACQiiGQoCAgICAgMD/AIOEIAJCGIZCgICAgIDgP4MgAkIIhkKAgICA8B+DhIQgAkIIiEKAgID4D4MgAkIYiEKAgPwHg4QgAkIoiEKA/gODIAJCOIiEhIQ3ACgLyQQCBX8BfiAAQSBqIQMgAEEIaiEEIAApAwAhBwJAAkAgACgCHCICQcAARgRAIAQgA0EBEAhBACECIABBADYCHAwBCyACQT9LDQELIABBHGoiBSACakEEakGAAToAACAAIAAoAhwiBkEBaiICNgIcAkAgAkHBAEkEQCACIAVqQQRqQQBBPyAGaxCRARpBwAAgACgCHGtBB00EQCAEIANBARAIIAAoAhwiAkHBAE8NAiAAQSBqQQAgAhCRARoLIABB2ABqIAdCA4YiB0I4hiAHQiiGQoCAgICAgMD/AIOEIAdCGIZCgICAgIDgP4MgB0IIhkKAgICA8B+DhIQgB0IIiEKAgID4D4MgB0IYiEKAgPwHg4QgB0IoiEKA/gODIAdCOIiEhIQ3AgAgBCADQQEQCCAAQQA2AhwgASAAKAIIIgJBGHQgAkEIdEGAgPwHcXIgAkEIdkGA/gNxIAJBGHZycjYAACABIABBDGooAgAiAkEYdCACQQh0QYCA/AdxciACQQh2QYD+A3EgAkEYdnJyNgAEIAEgAEEQaigCACICQRh0IAJBCHRBgID8B3FyIAJBCHZBgP4DcSACQRh2cnI2AAggASAAQRRqKAIAIgJBGHQgAkEIdEGAgPwHcXIgAkEIdkGA/gNxIAJBGHZycjYADCABIABBGGooAgAiAEEYdCAAQQh0QYCA/AdxciAAQQh2QYD+A3EgAEEYdnJyNgAQDwsgAkHAAEGAmsAAEH4ACyACQcAAQZCawAAQfQALIAJBwABBoJrAABB8AAviBAEEfyMAQfAAayICJAAgAkEqakIANwEAIAJBMmpBADsBACACQTRqQgA3AgAgAkE8akIANwIAIAJBADsBJCACQQA2ASYgAkEgNgIgIAJB4ABqIAJBOGopAwA3AwAgAkHYAGogAkEwaikDADcDACACQdAAaiACQShqKQMANwMAIAJB6ABqIAJBQGsoAgA2AgAgAiACKQMgNwNIIAJBEGogAkHcAGopAgA3AwAgAkEIaiACQdQAaikCADcDACACQRhqIAJB5ABqKQIANwMAIAIgAikCTDcDACABIAIQOyABQQA2AgggAUIANwMAIAFBrJjAACkCADcCTCABQdQAakG0mMAAKQIANwIAIAFB3ABqQbyYwAApAgA3AgAgAUHkAGpBxJjAACkCADcCAAJAAkBBIEEBEKEBIgMEQCACQiA3AkwgAiADNgJIIAJByABqIAJBIBBeAkAgAigCTCIEIAIoAlAiA0YEQCAEIQMMAQsgBCADSQ0CIARFDQAgAigCSCEFAkAgA0UEQCAFEBBBASEEDAELIAUgBEEBIAMQmgEiBEUNBAsgAiADNgJMIAIgBDYCSAsgAigCSCEEIAFBADYCCCABQgA3AwAgAUHMAGoiAUGsmMAAKQIANwIAIAFBCGpBtJjAACkCADcCACABQRBqQbyYwAApAgA3AgAgAUEYakHEmMAAKQIANwIAIAAgAzYCBCAAIAQ2AgAgAkHwAGokAA8LQSBBAUG0pcAAKAIAIgBBAiAAGxEAAAALQYeMwABBJEGsjMAAEIgBAAsgA0EBQbSlwAAoAgAiAEECIAAbEQAAAAvMBAEEfyMAQdABayICJAAgAkHKAGpCADcBACACQdIAakEAOwEAIAJB1ABqQgA3AgAgAkHcAGpCADcCACACQeQAakIANwIAIAJB7ABqQgA3AgAgAkH0AGpCADcCACACQfwAakEAOgAAIAJB/QBqQQA2AAAgAkGBAWpBADsAACACQYMBakEAOgAAIAJBADsBRCACQQA2AUYgAkHAADYCQCACQYgBaiACQUBrQcQAEIsBGiACQThqIAJBxAFqKQIANwMAIAJBMGogAkG8AWopAgA3AwAgAkEoaiACQbQBaikCADcDACACQSBqIAJBrAFqKQIANwMAIAJBGGogAkGkAWopAgA3AwAgAkEQaiACQZwBaikCADcDACACQQhqIAJBlAFqKQIANwMAIAIgAikCjAE3AwAgASACEFsgAUEAQcgBEJEBIgVBADYCyAECQAJAQcAAQQEQoQEiAQRAIAJCwAA3AowBIAIgATYCiAEgAkGIAWogAkHAABBeAkAgAigCjAEiAyACKAKQASIBRgRAIAMhAQwBCyADIAFJDQIgA0UNACACKAKIASEEAkAgAUUEQCAEEBBBASEDDAELIAQgA0EBIAEQmgEiA0UNBAsgAiABNgKMASACIAM2AogBCyACKAKIASEDIAVBAEHIARCRAUEANgLIASAAIAE2AgQgACADNgIAIAJB0AFqJAAPC0HAAEEBQbSlwAAoAgAiAEECIAAbEQAAAAtBh4zAAEEkQayMwAAQiAEACyABQQFBtKXAACgCACIAQQIgABsRAAAAC8wEAQR/IwBB0AFrIgIkACACQcoAakIANwEAIAJB0gBqQQA7AQAgAkHUAGpCADcCACACQdwAakIANwIAIAJB5ABqQgA3AgAgAkHsAGpCADcCACACQfQAakIANwIAIAJB/ABqQQA6AAAgAkH9AGpBADYAACACQYEBakEAOwAAIAJBgwFqQQA6AAAgAkEAOwFEIAJBADYBRiACQcAANgJAIAJBiAFqIAJBQGtBxAAQiwEaIAJBOGogAkHEAWopAgA3AwAgAkEwaiACQbwBaikCADcDACACQShqIAJBtAFqKQIANwMAIAJBIGogAkGsAWopAgA3AwAgAkEYaiACQaQBaikCADcDACACQRBqIAJBnAFqKQIANwMAIAJBCGogAkGUAWopAgA3AwAgAiACKQKMATcDACABIAIQXCABQQBByAEQkQEiBUEANgLIAQJAAkBBwABBARChASIBBEAgAkLAADcCjAEgAiABNgKIASACQYgBaiACQcAAEF4CQCACKAKMASIDIAIoApABIgFGBEAgAyEBDAELIAMgAUkNAiADRQ0AIAIoAogBIQQCQCABRQRAIAQQEEEBIQMMAQsgBCADQQEgARCaASIDRQ0ECyACIAE2AowBIAIgAzYCiAELIAIoAogBIQMgBUEAQcgBEJEBQQA2AsgBIAAgATYCBCAAIAM2AgAgAkHQAWokAA8LQcAAQQFBtKXAACgCACIAQQIgABsRAAAAC0GHjMAAQSRBrIzAABCIAQALIAFBAUG0pcAAKAIAIgBBAiAAGxEAAAALuAQBBH8jAEGgA2siAiQAIAJB4gJqQgA3AQAgAkHqAmpBADsBACACQewCakIANwIAIAJB9AJqQgA3AgAgAkH8AmpCADcCACACQYQDakIANwIAIAJBjANqQgA3AgAgAkGUA2pBADoAACACQZUDakEANgAAIAJBmQNqQQA7AAAgAkGbA2pBADoAACACQQA7AdwCIAJBADYB3gIgAkHAADYC2AIgAkFAayACQdgCakHEABCLARogAkE4aiACQfwAaikCADcDACACQTBqIAJB9ABqKQIANwMAIAJBKGogAkHsAGopAgA3AwAgAkEgaiACQeQAaikCADcDACACQRhqIAJB3ABqKQIANwMAIAJBEGogAkHUAGopAgA3AwAgAkEIaiACQcwAaikCADcDACACIAIpAkQ3AwAgAkFAayABQZgCEIsBGiACQUBrIAIQWwJAAkBBwABBARChASIDBEAgAkLAADcCRCACIAM2AkAgAkFAayACQcAAEF4CQCACKAJEIgQgAigCSCIDRgRAIAQhAwwBCyAEIANJDQIgBEUNACACKAJAIQUCQCADRQRAIAUQEEEBIQQMAQsgBSAEQQEgAxCaASIERQ0ECyACIAM2AkQgAiAENgJACyACKAJAIQQgARAQIAAgAzYCBCAAIAQ2AgAgAkGgA2okAA8LQcAAQQFBtKXAACgCACIAQQIgABsRAAAAC0GHjMAAQSRBrIzAABCIAQALIANBAUG0pcAAKAIAIgBBAiAAGxEAAAALuAQBBH8jAEGgA2siAiQAIAJB4gJqQgA3AQAgAkHqAmpBADsBACACQewCakIANwIAIAJB9AJqQgA3AgAgAkH8AmpCADcCACACQYQDakIANwIAIAJBjANqQgA3AgAgAkGUA2pBADoAACACQZUDakEANgAAIAJBmQNqQQA7AAAgAkGbA2pBADoAACACQQA7AdwCIAJBADYB3gIgAkHAADYC2AIgAkFAayACQdgCakHEABCLARogAkE4aiACQfwAaikCADcDACACQTBqIAJB9ABqKQIANwMAIAJBKGogAkHsAGopAgA3AwAgAkEgaiACQeQAaikCADcDACACQRhqIAJB3ABqKQIANwMAIAJBEGogAkHUAGopAgA3AwAgAkEIaiACQcwAaikCADcDACACIAIpAkQ3AwAgAkFAayABQZgCEIsBGiACQUBrIAIQXAJAAkBBwABBARChASIDBEAgAkLAADcCRCACIAM2AkAgAkFAayACQcAAEF4CQCACKAJEIgQgAigCSCIDRgRAIAQhAwwBCyAEIANJDQIgBEUNACACKAJAIQUCQCADRQRAIAUQEEEBIQQMAQsgBSAEQQEgAxCaASIERQ0ECyACIAM2AkQgAiAENgJACyACKAJAIQQgARAQIAAgAzYCBCAAIAQ2AgAgAkGgA2okAA8LQcAAQQFBtKXAACgCACIAQQIgABsRAAAAC0GHjMAAQSRBrIzAABCIAQALIANBAUG0pcAAKAIAIgBBAiAAGxEAAAALuAQBBH8jAEHgAmsiAiQAIAJBogJqQgA3AQAgAkGqAmpBADsBACACQawCakIANwIAIAJBtAJqQgA3AgAgAkG8AmpCADcCACACQcQCakIANwIAIAJBzAJqQgA3AgAgAkHUAmpBADoAACACQdUCakEANgAAIAJB2QJqQQA7AAAgAkHbAmpBADoAACACQQA7AZwCIAJBADYBngIgAkHAADYCmAIgAkFAayACQZgCakHEABCLARogAkE4aiACQfwAaikCADcDACACQTBqIAJB9ABqKQIANwMAIAJBKGogAkHsAGopAgA3AwAgAkEgaiACQeQAaikCADcDACACQRhqIAJB3ABqKQIANwMAIAJBEGogAkHUAGopAgA3AwAgAkEIaiACQcwAaikCADcDACACIAIpAkQ3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AABzOgAAIAVBAWoiBUHIAEcNAAsgABAOIAZByABJDQJByAAhBSACQcgAaiECIAhByABqIQgMAAsACyACIARqIgYgBEkNAiAGQcgASw0DIAAgBGpBzAFqIAEgAhCLARogACgCyAEgAmohBwwBCyAAQcwBaiABIARqIAcQiwEaCyAAIAc2AsgBIANBQGskAA8LIAQgBkHAm8AAEH4ACyAGQcgAQcCbwAAQfQALIARByABB0JvAABB+AAsgBCACQeCbwAAQfQALIANBNGpBBjYCACADQSRqQQI2AgAgA0IDNwIUIANBuJ7AADYCECADQQY2AiwgAyADQQxqNgI4IANB3J7AADYCPCADIANBKGo2AiAgAyADQTxqNgIwIAMgA0E4ajYCKCADQRBqQeCewAAQkAEAC5sEAQd/IwBBQGoiAyQAAkACQAJAAkACQAJAAkBB6AAgACgCyAEiBGsiBiACTQRAIAQEQCAEQekATw0GIAAgBGpBzAFqIAEgBhCLARogAiAGayECIAEgBmohAQNAIAAgBWoiBCAELQAAIARBzAFqLQAAczoAACAFQQFqIgVB6ABHDQALIAAQDgsgAiACQegAcCIHayEEIAIgB0kNBiAEQegASQ0BIAFB6ABqIQggASECIAQhBkHoACEFA0AgAyAFNgIMIAVB6ABHDQggBkGYf2ohBkEAIQUDQCAAIAVqIgkgCS0AACACIAVqLQAAczoAACAFQQFqIgVB6ABHDQALIAAQDiAGQegASQ0CQegAIQUgAkHoAGohAiAIQegAaiEIDAALAAsgAiAEaiIGIARJDQIgBkHoAEsNAyAAIARqQcwBaiABIAIQiwEaIAAoAsgBIAJqIQcMAQsgAEHMAWogASAEaiAHEIsBGgsgACAHNgLIASADQUBrJAAPCyAEIAZBwJvAABB+AAsgBkHoAEHAm8AAEH0ACyAEQegAQdCbwAAQfgALIAQgAkHgm8AAEH0ACyADQTRqQQY2AgAgA0EkakECNgIAIANCAzcCFCADQbiewAA2AhAgA0EGNgIsIAMgA0EMajYCOCADQdiewAA2AjwgAyADQShqNgIgIAMgA0E8ajYCMCADIANBOGo2AiggA0EQakHgnsAAEJABAAvkAwEEfyMAQcABayICJAAgAkGiAWpCADcBACACQaoBakEAOwEAIAJBrAFqQgA3AgAgAkG0AWpCADcCACACQQA7AZwBIAJBADYBngEgAkEgNgKYASACQUBrIAJBsAFqKQMANwMAIAJBOGogAkGoAWopAwA3AwAgAkEwaiACQaABaikDADcDACACQcgAaiACQbgBaigCADYCACACIAIpA5gBNwMoIAJBGGogAkE8aikCADcDACACQRBqIAJBNGopAgA3AwAgAkEgaiACQcQAaikCADcDACACIAIpAiw3AwggAkEoaiABQfAAEIsBGiACQShqIAJBCGoQOwJAAkBBIEEBEKEBIgMEQCACQiA3AiwgAiADNgIoIAJBKGogAkEIakEgEF4CQCACKAIsIgQgAigCMCIDRgRAIAQhAwwBCyAEIANJDQIgBEUNACACKAIoIQUCQCADRQRAIAUQEEEBIQQMAQsgBSAEQQEgAxCaASIERQ0ECyACIAM2AiwgAiAENgIoCyACKAIoIQQgARAQIAAgAzYCBCAAIAQ2AgAgAkHAAWokAA8LQSBBAUG0pcAAKAIAIgBBAiAAGxEAAAALQYeMwABBJEGsjMAAEIgBAAsgA0EBQbSlwAAoAgAiAEECIAAbEQAAAAuOBAEFfyMAQYABayICJAAgAkHyAGpCADcBACACQfoAakEAOwEAIAJBADsBbCACQQA2AW4gAkEQNgJoIAJBGGogAkHwAGoiBCkDADcDACACQSBqIAJB+ABqKAIANgIAIAJBCGoiBSACQRxqKQIANwMAIAIgAikDaDcDECACIAIpAhQ3AwAgAkEQaiABQdQAEIsBGgJAAkACQCACKAIQIgNBEEkEQCACQRBqQQRyIgYgA2pBECADayIDIAMQkQEaIAJBADYCECACQSRqIgMgBhALIAQgAkHcAGopAgA3AwAgAiACQdQAaikCADcDaCADIAJB6ABqEAsgBSACQSxqKQIANwMAIAIgAikCJDcDAEEQQQEQoQEiA0UNASACQhA3AhQgAiADNgIQIAJBEGogAkEQEF4CQCACKAIUIgQgAigCGCIDRgRAIAQhAwwBCyAEIANJDQMgBEUNACACKAIQIQUCQCADRQRAIAUQEEEBIQQMAQsgBSAEQQEgAxCaASIERQ0FCyACIAM2AhQgAiAENgIQCyACKAIQIQQgARAQIAAgAzYCBCAAIAQ2AgAgAkGAAWokAA8LQbCawABBFyACQegAakGgl8AAQbCXwAAQeQALQRBBAUG0pcAAKAIAIgBBAiAAGxEAAAALQYeMwABBJEGsjMAAEIgBAAsgA0EBQbSlwAAoAgAiAEECIAAbEQAAAAuFBAEEfyMAQdAAayICJAAgAkEqakIANwEAIAJBMmpBADsBACACQRQ2AiAgAkE0akEANgIAIAJBADsBJCACQQA2ASYgAkHIAGogAkEwaikDADcDACACQUBrIAJBKGopAwA3AwAgAkEQaiACQcQAaikCADcDACACQRhqIAJBzABqKAIANgIAIAIgAikDIDcDOCACIAIpAjw3AwggASACQQhqEFogAUIANwMAIAFBADYCHCABQfiXwAApAwA3AwggAUEQakGAmMAAKQMANwMAIAFBGGpBiJjAACgCADYCAAJAAkBBFEEBEKEBIgMEQCACQhQ3AjwgAiADNgI4IAJBOGogAkEIakEUEF4CQCACKAI8IgQgAigCQCIDRgRAIAQhAwwBCyAEIANJDQIgBEUNACACKAI4IQUCQCADRQRAIAUQEEEBIQQMAQsgBSAEQQEgAxCaASIERQ0ECyACIAM2AjwgAiAENgI4CyACKAI4IQQgAUIANwMAIAFBADYCHCABQQhqIgFB+JfAACkDADcDACABQQhqQYCYwAApAwA3AwAgAUEQakGImMAAKAIANgIAIAAgAzYCBCAAIAQ2AgAgAkHQAGokAA8LQRRBAUG0pcAAKAIAIgBBAiAAGxEAAAALQYeMwABBJEGsjMAAEIgBAAsgA0EBQbSlwAAoAgAiAEECIAAbEQAAAAuFBAEEfyMAQdAAayICJAAgAkEqakIANwEAIAJBMmpBADsBACACQRQ2AiAgAkE0akEANgIAIAJBADsBJCACQQA2ASYgAkHIAGogAkEwaikDADcDACACQUBrIAJBKGopAwA3AwAgAkEQaiACQcQAaikCADcDACACQRhqIAJBzABqKAIANgIAIAIgAikDIDcDOCACIAIpAjw3AwggASACQQhqECAgAUEANgIcIAFCADcDACABQRhqQYiYwAAoAgA2AgAgAUEQakGAmMAAKQMANwMAIAFB+JfAACkDADcDCAJAAkBBFEEBEKEBIgMEQCACQhQ3AjwgAiADNgI4IAJBOGogAkEIakEUEF4CQCACKAI8IgQgAigCQCIDRgRAIAQhAwwBCyAEIANJDQIgBEUNACACKAI4IQUCQCADRQRAIAUQEEEBIQQMAQsgBSAEQQEgAxCaASIERQ0ECyACIAM2AjwgAiAENgI4CyACKAI4IQQgAUEANgIcIAFCADcDACABQQhqIgFBEGpBiJjAACgCADYCACABQQhqQYCYwAApAwA3AwAgAUH4l8AAKQMANwMAIAAgAzYCBCAAIAQ2AgAgAkHQAGokAA8LQRRBAUG0pcAAKAIAIgBBAiAAGxEAAAALQYeMwABBJEGsjMAAEIgBAAsgA0EBQbSlwAAoAgAiAEECIAAbEQAAAAvlAwEEfyMAQfAAayICJAAgAkEqakIANwEAIAJBMmpBADsBACACQTRqQgA3AgAgAkE8akIANwIAIAJBADsBJCACQQA2ASYgAkEgNgIgIAJB4ABqIAJBOGopAwA3AwAgAkHYAGogAkEwaikDADcDACACQdAAaiACQShqKQMANwMAIAJB6ABqIAJBQGsoAgA2AgAgAiACKQMgNwNIIAJBEGogAkHcAGopAgA3AwAgAkEIaiACQdQAaikCADcDACACQRhqIAJB5ABqKQIANwMAIAIgAikCTDcDACABIAIQZiABQQBByAEQkQEiBUEANgLIAQJAAkBBIEEBEKEBIgEEQCACQiA3AkwgAiABNgJIIAJByABqIAJBIBBeAkAgAigCTCIDIAIoAlAiAUYEQCADIQEMAQsgAyABSQ0CIANFDQAgAigCSCEEAkAgAUUEQCAEEBBBASEDDAELIAQgA0EBIAEQmgEiA0UNBAsgAiABNgJMIAIgAzYCSAsgAigCSCEDIAVBAEHIARCRAUEANgLIASAAIAE2AgQgACADNgIAIAJB8ABqJAAPC0EgQQFBtKXAACgCACIAQQIgABsRAAAAC0GHjMAAQSRBrIzAABCIAQALIAFBAUG0pcAAKAIAIgBBAiAAGxEAAAAL5QMBBH8jAEHwAGsiAiQAIAJBKmpCADcBACACQTJqQQA7AQAgAkE0akIANwIAIAJBPGpCADcCACACQQA7ASQgAkEANgEmIAJBIDYCICACQeAAaiACQThqKQMANwMAIAJB2ABqIAJBMGopAwA3AwAgAkHQAGogAkEoaikDADcDACACQegAaiACQUBrKAIANgIAIAIgAikDIDcDSCACQRBqIAJB3ABqKQIANwMAIAJBCGogAkHUAGopAgA3AwAgAkEYaiACQeQAaikCADcDACACIAIpAkw3AwAgASACEGcgAUEAQcgBEJEBIgVBADYCyAECQAJAQSBBARChASIBBEAgAkIgNwJMIAIgATYCSCACQcgAaiACQSAQXgJAIAIoAkwiAyACKAJQIgFGBEAgAyEBDAELIAMgAUkNAiADRQ0AIAIoAkghBAJAIAFFBEAgBBAQQQEhAwwBCyAEIANBASABEJoBIgNFDQQLIAIgATYCTCACIAM2AkgLIAIoAkghAyAFQQBByAEQkQFBADYCyAEgACABNgIEIAAgAzYCACACQfAAaiQADwtBIEEBQbSlwAAoAgAiAEECIAAbEQAAAAtBh4zAAEEkQayMwAAQiAEACyABQQFBtKXAACgCACIAQQIgABsRAAAAC9wDAQR/IwBBoANrIgIkACACQYIDakIANwEAIAJBigNqQQA7AQAgAkGMA2pCADcCACACQZQDakIANwIAIAJBADsB/AIgAkEANgH+AiACQSA2AvgCIAJBOGogAkGQA2opAwA3AwAgAkEwaiACQYgDaikDADcDACACQShqIAJBgANqKQMANwMAIAJBQGsgAkGYA2ooAgA2AgAgAiACKQP4AjcDICACQRBqIAJBNGopAgA3AwAgAkEIaiACQSxqKQIANwMAIAJBGGogAkE8aikCADcDACACIAIpAiQ3AwAgAkEgaiABQdgCEIsBGiACQSBqIAIQZgJAAkBBIEEBEKEBIgMEQCACQiA3AiQgAiADNgIgIAJBIGogAkEgEF4CQCACKAIkIgQgAigCKCIDRgRAIAQhAwwBCyAEIANJDQIgBEUNACACKAIgIQUCQCADRQRAIAUQEEEBIQQMAQsgBSAEQQEgAxCaASIERQ0ECyACIAM2AiQgAiAENgIgCyACKAIgIQQgARAQIAAgAzYCBCAAIAQ2AgAgAkGgA2okAA8LQSBBAUG0pcAAKAIAIgBBAiAAGxEAAAALQYeMwABBJEGsjMAAEIgBAAsgA0EBQbSlwAAoAgAiAEECIAAbEQAAAAvcAwEEfyMAQaADayICJAAgAkGCA2pCADcBACACQYoDakEAOwEAIAJBjANqQgA3AgAgAkGUA2pCADcCACACQQA7AfwCIAJBADYB/gIgAkEgNgL4AiACQThqIAJBkANqKQMANwMAIAJBMGogAkGIA2opAwA3AwAgAkEoaiACQYADaikDADcDACACQUBrIAJBmANqKAIANgIAIAIgAikD+AI3AyAgAkEQaiACQTRqKQIANwMAIAJBCGogAkEsaikCADcDACACQRhqIAJBPGopAgA3AwAgAiACKQIkNwMAIAJBIGogAUHYAhCLARogAkEgaiACEGcCQAJAQSBBARChASIDBEAgAkIgNwIkIAIgAzYCICACQSBqIAJBIBBeAkAgAigCJCIEIAIoAigiA0YEQCAEIQMMAQsgBCADSQ0CIARFDQAgAigCICEFAkAgA0UEQCAFEBBBASEEDAELIAUgBEEBIAMQmgEiBEUNBAsgAiADNgIkIAIgBDYCIAsgAigCICEEIAEQECAAIAM2AgQgACAENgIAIAJBoANqJAAPC0EgQQFBtKXAACgCACIAQQIgABsRAAAAC0GHjMAAQSRBrIzAABCIAQALIANBAUG0pcAAKAIAIgBBAiAAGxEAAAAL0wMBBH8jAEHgAGsiAiQAIAJBKmpCADcBACACQTJqQQA7AQAgAkE0akIANwIAIAJBHDYCICACQTxqQQA2AgAgAkEAOwEkIAJBADYBJiACQdgAaiACQThqKQMANwMAIAJB0ABqIAJBMGopAwA3AwAgAkHIAGogAkEoaikDADcDACACIAIpAyA3A0AgAkEYaiACQdwAaigCADYCACACQRBqIAJB1ABqKQIANwMAIAJBCGogAkHMAGopAgA3AwAgAiACKQJENwMAIAEgAhBoIAFBAEHIARCRASIFQQA2AsgBAkACQEEcQQEQoQEiAQRAIAJCHDcCRCACIAE2AkAgAkFAayACQRwQXgJAIAIoAkQiAyACKAJIIgFGBEAgAyEBDAELIAMgAUkNAiADRQ0AIAIoAkAhBAJAIAFFBEAgBBAQQQEhAwwBCyAEIANBASABEJoBIgNFDQQLIAIgATYCRCACIAM2AkALIAIoAkAhAyAFQQBByAEQkQFBADYCyAEgACABNgIEIAAgAzYCACACQeAAaiQADwtBHEEBQbSlwAAoAgAiAEECIAAbEQAAAAtBh4zAAEEkQayMwAAQiAEACyABQQFBtKXAACgCACIAQQIgABsRAAAAC9MDAQR/IwBB4ABrIgIkACACQSpqQgA3AQAgAkEyakEAOwEAIAJBNGpCADcCACACQRw2AiAgAkE8akEANgIAIAJBADsBJCACQQA2ASYgAkHYAGogAkE4aikDADcDACACQdAAaiACQTBqKQMANwMAIAJByABqIAJBKGopAwA3AwAgAiACKQMgNwNAIAJBGGogAkHcAGooAgA2AgAgAkEQaiACQdQAaikCADcDACACQQhqIAJBzABqKQIANwMAIAIgAikCRDcDACABIAIQaSABQQBByAEQkQEiBUEANgLIAQJAAkBBHEEBEKEBIgEEQCACQhw3AkQgAiABNgJAIAJBQGsgAkEcEF4CQCACKAJEIgMgAigCSCIBRgRAIAMhAQwBCyADIAFJDQIgA0UNACACKAJAIQQCQCABRQRAIAQQEEEBIQMMAQsgBCADQQEgARCaASIDRQ0ECyACIAE2AkQgAiADNgJACyACKAJAIQMgBUEAQcgBEJEBQQA2AsgBIAAgATYCBCAAIAM2AgAgAkHgAGokAA8LQRxBAUG0pcAAKAIAIgBBAiAAGxEAAAALQYeMwABBJEGsjMAAEIgBAAsgAUEBQbSlwAAoAgAiAEECIAAbEQAAAAvkAwIJfwF+IwBBoAFrIgIkACACQUBrIAFBBGoQciABKAIAIQggAkH4AGoiAyABQTxqKQAANwMAIAJB8ABqIgQgAUE0aikAADcDACACQegAaiIFIAFBLGopAAA3AwAgAkHgAGoiBiABQSRqKQAANwMAIAJB2ABqIgcgAUEcaikAADcDACACIAEpABQ3A1AgAkGQAWogAUHEAGoQciACQQhqIgkgBykDADcDACACQRBqIgcgBikDADcDACACQRhqIgYgBSkDADcDACACQSBqIgUgBCkDADcDACACQShqIgQgAykDADcDACACQTBqIgMgAikDkAEiCzcDACACQThqIgogAkGYAWopAwA3AwAgAiALNwOAASACIAIpA1A3AwBB1ABBBBChASIBRQRAQdQAQQRBtKXAACgCACIAQQIgABsRAAAACyABIAg2AgAgASACKQNANwIEIAEgAikDADcCFCABQQxqIAJByABqKQMANwIAIAFBHGogCSkDADcCACABQSRqIAcpAwA3AgAgAUEsaiAGKQMANwIAIAFBNGogBSkDADcCACABQTxqIAQpAwA3AgAgAUHEAGogAykDADcCACABQcwAaiAKKQMANwIAIABB9I/AADYCBCAAIAE2AgAgAkGgAWokAAvLAwEEfyMAQaADayICJAAgAkGKA2pCADcBACACQZIDakEAOwEAIAJBlANqQgA3AgAgAkEcNgKAAyACQZwDakEANgIAIAJBADsBhAMgAkEANgGGAyACQThqIAJBmANqKQMANwMAIAJBMGogAkGQA2opAwA3AwAgAkEoaiACQYgDaikDADcDACACIAIpA4ADNwMgIAJBGGogAkE8aigCADYCACACQRBqIAJBNGopAgA3AwAgAkEIaiACQSxqKQIANwMAIAIgAikCJDcDACACQSBqIAFB4AIQiwEaIAJBIGogAhBpAkACQEEcQQEQoQEiAwRAIAJCHDcCJCACIAM2AiAgAkEgaiACQRwQXgJAIAIoAiQiBCACKAIoIgNGBEAgBCEDDAELIAQgA0kNAiAERQ0AIAIoAiAhBQJAIANFBEAgBRAQQQEhBAwBCyAFIARBASADEJoBIgRFDQQLIAIgAzYCJCACIAQ2AiALIAIoAiAhBCABEBAgACADNgIEIAAgBDYCACACQaADaiQADwtBHEEBQbSlwAAoAgAiAEECIAAbEQAAAAtBh4zAAEEkQayMwAAQiAEACyADQQFBtKXAACgCACIAQQIgABsRAAAAC8sDAQR/IwBBoANrIgIkACACQYoDakIANwEAIAJBkgNqQQA7AQAgAkGUA2pCADcCACACQRw2AoADIAJBnANqQQA2AgAgAkEAOwGEAyACQQA2AYYDIAJBOGogAkGYA2opAwA3AwAgAkEwaiACQZADaikDADcDACACQShqIAJBiANqKQMANwMAIAIgAikDgAM3AyAgAkEYaiACQTxqKAIANgIAIAJBEGogAkE0aikCADcDACACQQhqIAJBLGopAgA3AwAgAiACKQIkNwMAIAJBIGogAUHgAhCLARogAkEgaiACEGgCQAJAQRxBARChASIDBEAgAkIcNwIkIAIgAzYCICACQSBqIAJBHBBeAkAgAigCJCIEIAIoAigiA0YEQCAEIQMMAQsgBCADSQ0CIARFDQAgAigCICEFAkAgA0UEQCAFEBBBASEEDAELIAUgBEEBIAMQmgEiBEUNBAsgAiADNgIkIAIgBDYCIAsgAigCICEEIAEQECAAIAM2AgQgACAENgIAIAJBoANqJAAPC0EcQQFBtKXAACgCACIAQQIgABsRAAAAC0GHjMAAQSRBrIzAABCIAQALIANBAUG0pcAAKAIAIgBBAiAAGxEAAAALywMBBH8jAEGwAWsiAiQAIAJBmgFqQgA3AQAgAkGiAWpBADsBACACQaQBakIANwIAIAJBHDYCkAEgAkGsAWpBADYCACACQQA7AZQBIAJBADYBlgEgAkE4aiACQagBaikDADcDACACQTBqIAJBoAFqKQMANwMAIAJBKGogAkGYAWopAwA3AwAgAiACKQOQATcDICACQRhqIAJBPGooAgA2AgAgAkEQaiACQTRqKQIANwMAIAJBCGogAkEsaikCADcDACACIAIpAiQ3AwAgAkEgaiABQfAAEIsBGiACQSBqIAIQTwJAAkBBHEEBEKEBIgMEQCACQhw3AiQgAiADNgIgIAJBIGogAkEcEF4CQCACKAIkIgQgAigCKCIDRgRAIAQhAwwBCyAEIANJDQIgBEUNACACKAIgIQUCQCADRQRAIAUQEEEBIQQMAQsgBSAEQQEgAxCaASIERQ0ECyACIAM2AiQgAiAENgIgCyACKAIgIQQgARAQIAAgAzYCBCAAIAQ2AgAgAkGwAWokAA8LQRxBAUG0pcAAKAIAIgBBAiAAGxEAAAALQYeMwABBJEGsjMAAEIgBAAsgA0EBQbSlwAAoAgAiAEECIAAbEQAAAAu3AwIBfwR+IwBBIGsiAiQAIAAQVCACQQhqIABB1ABqKQIAIgM3AwAgAkEQaiAAQdwAaikCACIENwMAIAJBGGogAEHkAGopAgAiBTcDACABIAApAkwiBqciAEEYdCAAQQh0QYCA/AdxciAAQQh2QYD+A3EgAEEYdnJyNgAAIAEgA6ciAEEYdCAAQQh0QYCA/AdxciAAQQh2QYD+A3EgAEEYdnJyNgAIIAEgBKciAEEYdCAAQQh0QYCA/AdxciAAQQh2QYD+A3EgAEEYdnJyNgAQIAEgBaciAEEYdCAAQQh0QYCA/AdxciAAQQh2QYD+A3EgAEEYdnJyNgAYIAIgBjcDACABIAIoAgQiAEEYdCAAQQh0QYCA/AdxciAAQQh2QYD+A3EgAEEYdnJyNgAEIAEgAigCDCIAQRh0IABBCHRBgID8B3FyIABBCHZBgP4DcSAAQRh2cnI2AAwgASACKAIUIgBBGHQgAEEIdEGAgPwHcXIgAEEIdkGA/gNxIABBGHZycjYAFCABIAIoAhwiAEEYdCAAQQh0QYCA/AdxciAAQQh2QYD+A3EgAEEYdnJyNgAcIAJBIGokAAu0AwEGfyMAQUBqIgMkACAAIAApAwAgAq18NwMAAkACQAJAAkACQAJAQcAAIAAoAggiBGsiBSACTQRAIABBzABqIQcgBARAIARBwQBPDQYgBCAAQQxqIgRqIAEgBRCLARogByAEEA0gAiAFayECIAEgBWohAQsgAkE/cSEFIAJBQHEiCEHAAEkNASACIAVrQUBqIQYgASEEQcAAIQIDQCADIAI2AgwgAkHAAEcNByAHIAQQDSAGQcAASQ0CIARBQGshBCAGQUBqIQYMAAsACyACIARqIgUgBEkNAiAFQcAASw0DIAAgBGpBDGogASACEIsBGiAAKAIIIAJqIQUMAQsgAEEMaiABIAhqIAUQiwEaCyAAIAU2AgggA0FAayQADwsgBCAFQcCbwAAQfgALIAVBwABBwJvAABB9AAsgBEHAAEHQm8AAEH4ACyADQTRqQQY2AgAgA0EkakECNgIAIANCAzcCFCADQbiewAA2AhAgA0EGNgIsIAMgA0EMajYCOCADQayNwAA2AjwgAyADQShqNgIgIAMgA0E8ajYCMCADIANBOGo2AiggA0EQakHgnsAAEJABAAuzAwEGfyMAQUBqIgMkACAAIAApAwAgAq18NwMAAkACQAJAAkACQAJAQcAAIAAoAjAiBGsiBSACTQRAIABBCGohByAEBEAgBEHBAE8NBiAEIABBNGoiBGogASAFEIsBGiAHIAQQBiACIAVrIQIgASAFaiEBCyACQT9xIQUgAkFAcSIIQcAASQ0BIAIgBWtBQGohBiABIQRBwAAhAgNAIAMgAjYCDCACQcAARw0HIAcgBBAGIAZBwABJDQIgBEFAayEEIAZBQGohBgwACwALIAIgBGoiBSAESQ0CIAVBwABLDQMgACAEakE0aiABIAIQiwEaIAAoAjAgAmohBQwBCyAAQTRqIAEgCGogBRCLARoLIAAgBTYCMCADQUBrJAAPCyAEIAVBwJvAABB+AAsgBUHAAEHAm8AAEH0ACyAEQcAAQdCbwAAQfgALIANBNGpBBjYCACADQSRqQQI2AgAgA0IDNwIUIANBuJ7AADYCECADQQY2AiwgAyADQQxqNgI4IANBrI3AADYCPCADIANBKGo2AiAgAyADQTxqNgIwIAMgA0E4ajYCKCADQRBqQeCewAAQkAEAC7MDAQZ/IwBBQGoiAyQAIAAgACkDACACrXw3AwACQAJAAkACQAJAAkBBwAAgACgCHCIEayIFIAJNBEAgAEEIaiEHIAQEQCAEQcEATw0GIAQgAEEgaiIEaiABIAUQiwEaIAcgBBAHIAIgBWshAiABIAVqIQELIAJBP3EhBSACQUBxIghBwABJDQEgAiAFa0FAaiEGIAEhBEHAACECA0AgAyACNgIMIAJBwABHDQcgByAEEAcgBkHAAEkNAiAEQUBrIQQgBkFAaiEGDAALAAsgAiAEaiIFIARJDQIgBUHAAEsNAyAAIARqQSBqIAEgAhCLARogACgCHCACaiEFDAELIABBIGogASAIaiAFEIsBGgsgACAFNgIcIANBQGskAA8LIAQgBUHAm8AAEH4ACyAFQcAAQcCbwAAQfQALIARBwABB0JvAABB+AAsgA0E0akEGNgIAIANBJGpBAjYCACADQgM3AhQgA0G4nsAANgIQIANBBjYCLCADIANBDGo2AjggA0GsjcAANgI8IAMgA0EoajYCICADIANBPGo2AjAgAyADQThqNgIoIANBEGpB4J7AABCQAQALtAMBBn8jAEFAaiIDJAAgACAAKQMAIAKtfDcDAAJAAkACQAJAAkACQEHAACAAKAIIIgRrIgUgAk0EQCAAQcwAaiEHIAQEQCAEQcEATw0GIAQgAEEMaiIEaiABIAUQiwEaIAcgBBAKIAIgBWshAiABIAVqIQELIAJBP3EhBSACQUBxIghBwABJDQEgAiAFa0FAaiEGIAEhBEHAACECA0AgAyACNgIMIAJBwABHDQcgByAEEAogBkHAAEkNAiAEQUBrIQQgBkFAaiEGDAALAAsgAiAEaiIFIARJDQIgBUHAAEsNAyAAIARqQQxqIAEgAhCLARogACgCCCACaiEFDAELIABBDGogASAIaiAFEIsBGgsgACAFNgIIIANBQGskAA8LIAQgBUHAm8AAEH4ACyAFQcAAQcCbwAAQfQALIARBwABB0JvAABB+AAsgA0E0akEGNgIAIANBJGpBAjYCACADQgM3AhQgA0G4nsAANgIQIANBBjYCLCADIANBDGo2AjggA0GsjcAANgI8IAMgA0EoajYCICADIANBPGo2AjAgAyADQThqNgIoIANBEGpB4J7AABCQAQAL0QMCBX8CfiAAQdQAaiECIABBEGohAyAAQQhqKQMAIQYgACkDACEHAkACQCAAKAJQIgFBgAFGBEAgAyACQQEQDEEAIQEgAEEA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AXFyQQJyNgIEIAAgA2oiAyADKAIEQQFyNgIEIAUgAiAFKAIAQQFxckECcjYCACAAIAAoAgRBAXI2AgQgASACEBQMAQsgASgCACEBIAAgAzYCBCAAIAEgAmo2AgALAkAgAEEEaigCACIBQQNxRQ0AIAFBeHEiAiAEQRBqTQ0AIABBBGogBCABQQFxckECcjYCACAAIARqIgEgAiAEayIEQQNyNgIEIAAgAmoiAiACKAIEQQFyNgIEIAEgBBAUCyAAQQhqIQMLIAMLiwMCBn8BfiMAQfAAayICJAAgAkHQAGoiAyABQRBqKQMANwMAIAJB2ABqIgQgAUEYaikDADcDACACQeAAaiIFIAFBIGopAwA3AwAgAkHoAGoiBiABQShqKQMANwMAIAIgASkDCDcDSCABKQMAIQggAkEIaiABQTRqEGUgASgCMCEHQfgAQQgQoQEiAUUEQEH4AEEIQbSlwAAoAgAiAEECIAAbEQAAAAsgASAINwMAIAEgAikDSDcDCCABIAc2AjAgASACKQMINwI0IAFBEGogAykDADcDACABQRhqIAQpAwA3AwAgAUEgaiAFKQMANwMAIAFBKGogBikDADcDACABQTxqIAJBEGopAwA3AgAgAUHEAGogAkEYaikDADcCACABQcwAaiACQSBqKQMANwIAIAFB1ABqIAJBKGopAwA3AgAgAUHcAGogAkEwaikDADcCACABQeQAaiACQThqKQMANwIAIAFB7ABqIAJBQGspAwA3AgAgAEHgjMAANgIEIAAgATYCACACQfAAaiQAC4YDAQR/IwBBkAFrIgIkACACQYIBakIANwEAIAJBigFqQQA7AQAgAkEAOwF8IAJBADYBfiACQRA2AnggAkEgaiACQYABaikDADcDACACQShqIAJBiAFqKAIANgIAIAJBEGogAkEkaikCADcDACACIAIpA3g3AxggAiACKQIcNwMIIAJBGGogAUHgABCLARogAkEYaiACQQhqEF0CQAJAQRBBARChASIDBEAgAkIQNwIcIAIgAzYCGCACQRhqIAJBCGpBEBBeAkAgAigCHCIEIAIoAiAiA0YEQCAEIQMMAQsgBCADSQ0CIARFDQAgAigCGCEFAkAgA0UEQCAFEBBBASEEDAELIAUgBEEBIAMQmgEiBEUNBAsgAiADNgIcIAIgBDYCGAsgAigCGCEEIAEQ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QT8gBmsQkQEaQcAAIAAoAjBrQQdNBEAgBCADEAYgACgCMCICQcEATw0CIABBNGpBACACEJEBGgsgAEHsAGogB0IDhjcCACAEIAMQBiAAQQA2AjAgASAAKAIINgAAIAEgAEEMaigCADYABCABIABBEGooAgA2AAggASAAQRRqKAIANgAMIAEgAEEYaigCADYAECABIABBHGooAgA2ABQgASAAQSBqKAIANgAYIAEgAEEkaigCADYAHCABIABBKGooAgA2ACAgASAAQSxqKAIANgAkDwsgAkHAAEGAmsAAEH4ACyACQcAAQZCawAAQfQALIAJBwABBoJrAABB8AAvwAgIGfwF+IwBBEGsiBCQAIABBDGohBSAAQcwAaiEDIAApAwAhCAJAAkAgACgCCCICQcAARgRAIAMgBRAKQQAhAiAAQQA2AggMAQsgAkE/Sw0BCyAAQQhqIgYgAmpBBGpBgAE6AAAgACAAKAIIIgdBAWoiAjYCCAJAIAJBwQBJBEAgAiAGakEEakEAQT8gB2sQkQEaQcAAIAAoAghrQQdNBEAgAyAFEAogACgCCCICQcEATw0CIABBDGpBACACEJEBGgsgAEHEAGogCEIDhjcCACADIAUQCiAAQQA2AgggBEEIaiICIABB3ABqNgIEIAIgAzYCACAEKAIMIAQoAggiAGtBAnYiA0EEIANBBEkbIgIEQEEAIQMDQCABIAAoAgA2AAAgAEEEaiEAIAFBBGohASADQQFqIgMgAkkNAAsLIARBEGokAA8LIAJBwABBgJrAABB+AAsgAkHAAEGQmsAAEH0ACyACQcAAQaCawAAQfAAL1AIBAX8gABBUIAEgACgCTCICQRh0IAJBCHRBgID8B3FyIAJBCHZBgP4DcSACQRh2cnI2AAAgASAAQdAAaigCACICQRh0IAJBCHRBgID8B3FyIAJBCHZBgP4DcSACQRh2cnI2AAQgASAAQdQAaigCACICQRh0IAJBCHRBgID8B3FyIAJBCHZBgP4DcSACQRh2cnI2AAggASAAQdgAaigCACICQRh0IAJBCHRBgID8B3FyIAJBCHZBgP4DcSACQRh2cnI2AAwgASAAQdwAaigCACICQRh0IAJBCHRBgID8B3FyIAJBCHZBgP4DcSACQRh2cnI2ABAgASAAQeAAaigCACICQRh0IAJBCHRBgID8B3FyIAJBCHZBgP4DcSACQRh2cnI2ABQgASAAQeQAaigCACIAQRh0IABBCHRBgID8B3FyIABBCHZBgP4DcSAAQRh2cnI2ABgL7AICBX8BfiMAQeAAayICJAAgASkDACEHIAJBIGogAUEMahBlIAJBCGoiAyABQdQAaikCADcDACACQRBqIgQgAUHcAGopAgA3AwAgAkEYaiIFIAFB5ABqKQIANwMAIAIgASkCTDcDACABKAIIIQZB8ABBCBChASIBRQRAQfAAQQhBtKXAACgCACIAQQIgABsRAAAACyABIAY2AgggASAHNwMAIAEgAikDIDcCDCABQRRqIAJBKGopAwA3AgAgAUEcaiACQTBqKQMANwIAIAFBJGogAkE4aikDADcCACABQSxqIAJBQGspAwA3AgAgAUE0aiACQcgAaikDADcCACABQTxqIAJB0ABqKQMANwIAIAFBxABqIAJB2ABqKQMANwIAIAFB5ABqIAUpAwA3AgAgAUHcAGogBCkDADcCACABQdQAaiADKQMANwIAIAEgAikDADcCTCAAQeCQwAA2AgQgACABNgIAIAJB4ABqJAAL7AICBX8BfiMAQeAAayICJAAgASkDACEHIAJBIGogAUEMahBlIAJBCGoiAyABQdQAaikCADcDACACQRBqIgQgAUHcAGopAgA3AwAgAkEYaiIFIAFB5ABqKQIANwMAIAIgASkCTDcDACABKAIIIQZB8ABBCBChASIBRQRAQfAAQQhBtKXAACgCACIAQQIgABsRAAAACyABIAY2AgggASAHNwMAIAEgAikDIDcCDCABQRRqIAJBKGopAwA3AgAgAUEcaiACQTBqKQMANwIAIAFBJGogAkE4aikDADcCACABQSxqIAJBQGspAwA3AgAgAUE0aiACQcgAaikDADcCACABQTxqIAJB0ABqKQMANwIAIAFBxABqIAJB2ABqKQMANwIAIAFB5ABqIAUpAwA3AgAgAUHcAGogBCkDADcCACABQdQAaiADKQMANwIAIAEgAikDADcCTCAAQYSRwAA2AgQgACABNgIAIAJB4ABqJAALyAICBH8BfiMAQeAAayICJAAgAkHQAGoiAyABQRBqKQMANwMAIAJB2ABqIgQgAUEYaigCADYCACACIAEpAwg3A0ggASkDACEGIAJBCGogAUEgahBlIAEoAhwhBUHgAEEIEKEBIgFFBEBB4ABBCEG0pcAAKAIAIgBBAiAAGxEAAAALIAEgBjcDACABIAIpA0g3AwggASAFNgIcIAEgAikDCDcDICABQRBqIAMpAwA3AwAgAUEYaiAEKAIANgIAIAFBKGogAkEQaikDADcDACABQTBqIAJBGGopAwA3AwAgAUE4aiACQSBqKQMANwMAIAFBQGsgAkEoaikDADcDACABQcgAaiACQTBqKQMANwMAIAFB0ABqIAJBOGopAwA3AwAgAUHYAGogAkFAaykDADcDACAAQYSNwAA2AgQgACABNgIAIAJB4ABqJAALyAICBH8BfiMAQeAAayICJAAgAkHQAGoiAyABQRBqKQMANwMAIAJB2ABqIgQgAUEYaigCADYCACACIAEpAwg3A0ggASkDACEGIAJBCGogAUEgahBlIAEoAhwhBUHgAEEIEKEBIgFFBEBB4ABBCEG0pcAAKAIAIgBBAiAAGxEAAAALIAEgBjcDACABIAIpA0g3AwggASAFNgIcIAEgAikDCDcDICABQRBqIAMpAwA3AwAgAUEYaiAEKAIANgIAIAFBKGogAkEQaikDADcDACABQTBqIAJBGGopAwA3AwAgAUE4aiACQSBqKQMANwMAIAFBQGsgAkEoaikDADcDACABQcgAaiACQTBqKQMANwMAIAFB0ABqIAJBOGopAwA3AwAgAUHYAGogAkFAaykDADcDACAAQbCNwAA2AgQgACABNgIAIAJB4ABqJAAL3QICBX8BfiAAQQxqIQIgAEHMAGohAyAAKQMAIQYCQAJAIAAoAggiAUHAAEYEQCADIAJBARAEQQAhASAAQQA2AggMAQsgAUE/Sw0BCyAAQQhqIgQgAWpBBGpBgAE6AAAgACAAKAIIIgVBAWoiATYCCAJAIAFBwQBJBEAgASAEakEEakEAQT8gBWsQkQEaQcAAIAAoAghrQQdNBEAgAyACQQEQBCAAKAIIIgFBwQBPDQIgAEEMakEAIAEQkQEaCyAAQcQAaiAGQiiGQoCAgICAgMD/AIMgBkI4hoQgBkIYhkKAgICAgOA/gyAGQgiGQoCAgIDwH4OEhCAGQgiIQoCAgPgPgyAGQhiIQoCA/AeDhCAGQiiIQoD+A4MgBkI4iISEhDcCACADIAJBARAEIABBADYCCA8LIAFBwABBgJrAABB+AAsgAUHAAEGQmsAAEH0ACyABQcAAQaCawAAQfAALvgICBX8BfiMAQTBrIgQkAEEnIQICQCAAQpDOAFQEQCAAIQcMAQsDQCAEQQlqIAJqIgNBfGogACAAQpDOAIAiB0LwsX9+fKciBUH//wNxQeQAbiIGQQF0QdqIwABqLwAAOwAAIANBfmogBkGcf2wgBWpB//8DcUEBdEHaiMAAai8AADsAACACQXxqIQIgAEL/wdcvViAHIQANAAsLIAenIgNB4wBKBEAgAkF+aiICIARBCWpqIAenIgVB//8DcUHkAG4iA0Gcf2wgBWpB//8DcUEBdEHaiMAAai8AADsAAAsCQCADQQpOBEAgAkF+aiICIARBCWpqIANBAXRB2ojAAGovAAA7AAAMAQsgAkF/aiICIARBCWpqIANBMGo6AAALIAFByKDAAEEAIARBCWogAmpBJyACaxAYIARBMGokAAu/AgEDfyMAQRBrIgIkAAJAIAAoAgAiAAJ/AkAgAUGAAU8EQCACQQA2AgwgAUGAEEkNASABQYCABEkEQCACIAFBP3FBgAFyOgAOIAIgAUEMdkHgAXI6AAwgAiABQQZ2QT9xQYABcjoADUEDDAMLIAIgAUE/cUGAAXI6AA8gAiABQRJ2QfABcjoADCACIAFBBnZBP3FBgAFyOgAOIAIgAUEMdkE/cUGAAXI6AA1BBAwCCyAAKAIIIgMgAEEEaigCAEYEfyAAQQEQaiAAKAIIBSADCyAAKAIAaiABOgAAIAAgACgCCEEBajYCCAwCCyACIAFBP3FBgAFyOgANIAIgAUEGdkHAAXI6AAxBAgsiARBqIABBCGoiAygCACIEIAAoAgBqIAJBDGogARCLARogAyABIARqNgIACyACQRBqJABBAAvLAgEIfyMAQYABayIBQShqIgJCADcDACABQSBqIgNCADcDACABQRhqIgRCADcDACABQRBqIgVCADcDACABQQhqIgZCADcDACABQgA3AwAgAUHaAGpCADcBACABQeIAakEAOwEAIAFBEDYCUCABQQA7AVQgAUEANgFWIAFB+ABqIAFB4ABqKAIANgIAIAFB8ABqIAFB2ABqKQMANwMAIAFByABqIgcgAUH0AGopAgA3AwAgASABKQNQNwNoIAEgASkCbDcDQCABQThqIgggBykDADcDACABIAEpA0A3AzAgAEHMAGogCCkDADcAACAAQcQAaiABKQMwNwAAIABBPGogAikDADcAACAAQTRqIAMpAwA3AAAgAEEsaiAEKQMANwAAIABBJGogBSkDADcAACAAQRxqIAYpAwA3AAAgACABKQMANwAUIABBADYCAAuxAgEDfyMAQYABayIEJAAgACgCACEAAkACQAJ/AkAgASgCACIDQRBxRQRAIAAoAgAhAiADQSBxDQEgAq0gARBVDAILIAAoAgAhAkEAIQADQCAAIARqQf8AaiACQQ9xIgNBMHIgA0HXAGogA0EKSRs6AAAgAEF/aiEAIAJBBHYiAg0ACyAAQYABaiICQYEBTw0CIAFB2IvAAEECIAAgBGpBgAFqQQAgAGsQGAwBC0EAIQADQCAAIARqQf8AaiACQQ9xIgNBMHIgA0E3aiADQQpJGzoAACAAQX9qIQAgAkEEdiICDQALIABBgAFqIgJBgQFPDQIgAUHYi8AAQQIgACAEakGAAWpBACAAaxAYCyAEQYABaiQADwsgAkGAAUHIi8AAEH4ACyACQYABQciLwAAQfgALrAICA38CfiAAIAApAwAiBiACrUIDhnwiBzcDACAAQQhqIgMgAykDACAHIAZUrXw3AwACQAJAQYABIAAoAlAiA2siBCACTQRAIABBEGoiBSADBEAgA0GBAU8NAiADIABB1ABqIgNqIAEgBBCLARogAEEANgJQIAUgA0EBEAwgAiAEayECIAEgBGohAQsgASACQQd2EAwgAkH/AHEiA0GBAU8NAiAAQdQAaiABIAJBgH9xaiADEIsBGiAAIAM2AlAPCwJAIAIgA2oiBCADTwRAIARBgAFLDQEgACADakHUAGogASACEIsBGiAAIAAoAlAgAmo2AlAPCyADIARB0JnAABB+AAsgBEGAAUHQmcAAEH0ACyADQYABQeCZwAAQfgALIANBgAFB8JnAABB9AAu8AgIFfwF+IABBIGohAyAAQQhqIQQgACkDACEHAkACQCAAKAIcIgJBwABGBEAgBCADEAdBACECIABBADYCHAwBCyACQT9LDQELIABBHGoiBSACakEEakGAAToAACAAIAAoAhwiBkEBaiICNgIcAkAgAkHBAEkEQCACIAVqQQRqQQBBPyAGaxCRARpBwAAgACgCHGtBB00EQCAEIAMQByAAKAIcIgJBwQBPDQIgAEEgakEAIAIQkQEaCyAAQdgAaiAHQgOGNwIAIAQgAxAHIABBADYCHCABIAAoAgg2AAAgASAAQQxqKAIANgAEIAEgAEEQaigCADYACCABIABBFGooAgA2AAwgASAAQRhqKAIANgAQDwsgAkHAAEGAmsAAEH4ACyACQcAAQZCawAAQfQALIAJBwABBoJrAABB8AAu1AgEDfyMAQRBrIgQkACAAKALIASICQccATQRAIAAgAmpBzAFqQQY6AAAgAkEBaiIDQcgARwRAIAAgA2pBzAFqQQBBxwAgAmsQkQEaC0EAIQIgAEEANgLIASAAQZMCaiIDIAMtAABBgAFyOgAAA0AgACACaiIDIAMtAAAgA0HMAWotAABzOgAAIAJBAWoiAkHIAEcNAAsgABAOIAEgACkAADcAACABQThqIABBOGopAAA3AAAgAUEwaiAAQTBqKQAANwAAIAFBKGogAEEoaikAADcAACABQSBqIABBIGopAAA3AAAgAUEYaiAAQRhqKQAANwAAIAFBEGogAEEQaikAADcAACABQQhqIABBCGopAAA3AAAgBEEQaiQADwtBsJrAAEEXIARBCGpByJrAAEGknsAAEHkAC7UCAQN/IwBBEGsiBCQAIAAoAsgBIgJBxwBNBEAgACACakHMAWpBAToAACACQQFqIgNByABHBEAgACADakHMAWpBAEHHACACaxCRARoLQQAhAiAAQQA2AsgBIABBkwJqIgMgAy0AAEGAAXI6AAADQCAAIAJqIgMgAy0AACADQcwBai0AAHM6AAAgAkEBaiICQcgARw0ACyAAEA4gASAAKQAANwAAIAFBOGogAEE4aikAADcAACABQTBqIABBMGopAAA3AAAgAUEoaiAAQShqKQAANwAAIAFBIGogAEEgaikAADcAACABQRhqIABBGGopAAA3AAAgAUEQaiAAQRBqKQAANwAAIAFBCGogAEEIaikAADcAACAEQRBqJAAPC0GwmsAAQRcgBEEIakHImsAAQeSdwAAQeQALswICBX8BfiAAQQxqIQMgAEHMAGohBCAAKQMAIQcCQAJAIAAoAggiAkHAAEYEQCAEIAMQDUEAIQIgAEEANgIIDAELIAJBP0sNAQsgAEEIaiIFIAJqQQRqQYABOgAAIAAgACgCCCIGQQFqIgI2AggCQCACQcEASQRAIAIgBWpBBGpBAEE/IAZrEJEBGkHAACAAKAIIa0EHTQRAIAQgAxANIAAoAggiAkHBAE8NAiAAQQxqQQAgAhCRARoLIABBxABqIAdCA4Y3AgAgBCADEA0gAEEANgIIIAEgACgCTDYAACABIABB0ABqKAIANgAEIAEgAEHUAGooAgA2AAggASAAQdgAaigCADYADA8LIAJBwABBgJrAABB+AAsgAkHAAEGQmsAAEH0ACyACQcAAQaCawAAQfAALhgIBBH8CQCAAQQRqKAIAIgYgAEEIaigCACIFayACTwRAIAAoAgAhBAwBCwJAAn8gAiAFaiIDIAVPBEBBACAGQQF0IgUgAyAFIANLGyIDQQggA0EISxsiA0EASA0BGgJAIAAoAgBBACAGGyIERQRAIANBARChASIEDQQMAQsgAyAGRg0DIAZFBEAgA0EBEKEBIgRFDQEMBAsgBCAGQQEgAxCaASIEDQMLQQEMAQtBAAsiBARAIAMgBEG0pcAAKAIAIgBBAiAAGxEAAAALEJsBAAsgACAENgIAIABBBGogAzYCACAAQQhqKAIAIQULIAQgBWogASACEIsBGiAAQQhqIAIgBWo2AgALjAIBA38gACAAKQMAIAKtQgOGfDcDAAJAAkBBwAAgACgCCCIDayIEIAJNBEAgAEHMAGoiBSADBEAgA0HBAE8NAiADIABBDGoiA2ogASAEEIsBGiAAQQA2AgggBSADQQEQBCACIARrIQIgASAEaiEBCyABIAJBBnYQBCACQT9xIgNBwQBPDQIgAEEMaiABIAJBQHFqIAMQiwEaIAAgAzYCCA8LAkAgAiADaiIEIANPBEAgBEHAAEsNASAAIANqQQxqIAEgAhCLARogACAAKAIIIAJqNgIIDwsgAyAEQdCZwAAQfgALIARBwABB0JnAABB9AAsgA0HAAEHgmcAAEH4ACyADQcAAQfCZwAAQfQALqAICA38BfiMAQdAAayICJAAgASkDACEFIAJBEGogAUEMahBlIAJBCGoiAyABQdQAaikCADcDACACIAEpAkw3AwAgASgCCCEEQeAAQQgQoQEiAUUEQEHgAEEIQbSlwAAoAgAiAEECIAAbEQAAAAsgASAENgIIIAEgBTcDACABIAIpAxA3AgwgAUEUaiACQRhqKQMANwIAIAFBHGogAkEgaikDADcCACABQSRqIAJBKGopAwA3AgAgAUEsaiACQTBqKQMANwIAIAFBNGogAkE4aikDADcCACABQTxqIAJBQGspAwA3AgAgAUHEAGogAkHIAGopAwA3AgAgAUHUAGogAykDADcCACABIAIpAwA3AkwgAEG8jMAANgIEIAAgATYCACACQdAAaiQAC4gCAQN/IAAgACkDACACrXw3AwACQAJAQcAAIAAoAhwiA2siBCACTQRAIABBCGoiBSADBEAgA0HBAE8NAiADIABBIGoiA2ogASAEEIsBGiAAQQA2AhwgBSADQQEQCCACIARrIQIgASAEaiEBCyABIAJBBnYQCCACQT9xIgNBwQBPDQIgAEEgaiABIAJBQHFqIAMQiwEaIAAgAzYCHA8LAkAgAiADaiIEIANPBEAgBEHAAEsNASAAIANqQSBqIAEgAhCLARogACAAKAIcIAJqNgIcDwsgAyAEQdCZwAAQfgALIARBwABB0JnAABB9AAsgA0HAAEHgmcAAEH4ACyADQcAAQfCZwAAQfQALqAICA38BfiMAQdAAayICJAAgASkDACEFIAJBEGogAUEMahBlIAJBCGoiAyABQdQAaikCADcDACACIAEpAkw3AwAgASgCCCEEQeAAQQgQoQEiAUUEQEHgAEEIQbSlwAAoAgAiAEECIAAbEQAAAAsgASAENgIIIAEgBTcDACABIAIpAxA3AgwgAUEUaiACQRhqKQMANwIAIAFBHGogAkEgaikDADcCACABQSRqIAJBKGopAwA3AgAgAUEsaiACQTBqKQMANwIAIAFBNGogAkE4aikDADcCACABQTxqIAJBQGspAwA3AgAgAUHEAGogAkHIAGopAwA3AgAgAUHUAGogAykDADcCACABIAIpAwA3AkwgAEGokcAANgIEIAAgATYCACACQdAAaiQAC5UCAQN/IwBBEGsiBCQAIAAoAsgBIgJB5wBNBEAgACACakHMAWpBBjoAACACQQFqIgNB6ABHBEAgACADakHMAWpBAEHnACACaxCRARoLQQAhAiAAQQA2AsgBIABBswJqIgMgAy0AAEGAAXI6AAADQCAAIAJqIgMgAy0AACADQcwBai0AAHM6AAAgAkEBaiICQegARw0ACyAAEA4gASAAKQAANwAAIAFBKGogAEEoaikAADcAACABQSBqIABBIGopAAA3AAAgAUEYaiAAQRhqKQAANwAAIAFBEGogAEEQaikAADcAACABQQhqIABBCGopAAA3AAAgBEEQaiQADwtBsJrAAEEXIARBCGpByJrAAEGUnsAAEHkAC5UCAQN/IwBBEGsiBCQAIAAoAsgBIgJB5wBNBEAgACACakHMAWpBAToAACACQQFqIgNB6ABHBEAgACADakHMAWpBAEHnACACaxCRARoLQQAhAiAAQQA2AsgBIABBswJqIgMgAy0AAEGAAXI6AAADQCAAIAJqIgMgAy0AACADQcwBai0AAHM6AAAgAkEBaiICQegARw0ACyAAEA4gASAAKQAANwAAIAFBKGogAEEoaikAADcAACABQSBqIABBIGopAAA3AAAgAUEYaiAAQRhqKQAANwAAIAFBEGogAEEQaikAADcAACABQQhqIABBCGopAAA3AAAgBEEQaiQADwtBsJrAAEEXIARBCGpByJrAAEHUncAAEHkAC/MBAQR/IwBBkAFrIgIkACACQQA2AgAgAkEEciEFA0AgAyAFaiABIANqLQAAOgAAIAIgAigCAEEBaiIENgIAIANBAWoiA0HAAEcNAAsgBEE/TQRAIARBwAAQfwALIAJByABqIAJBxAAQiwEaIABBOGogAkGEAWopAgA3AAAgAEEwaiACQfwAaikCADcAACAAQShqIAJB9ABqKQIANwAAIABBIGogAkHsAGopAgA3AAAgAEEYaiACQeQAaikCADcAACAAQRBqIAJB3ABqKQIANwAAIABBCGogAkHUAGopAgA3AAAgACACKQJMNwAAIAJBkAFqJAAL9QEBA38jAEEQayIEJAAgACgCyAEiAkGHAU0EQCAAIAJqQcwBakEBOgAAIAJBAWoiA0GIAUcEQCAAIANqQcwBakEAQYcBIAJrEJEBGgtBACECIABBADYCyAEgAEHTAmoiAyADLQAAQYABcjoAAANAIAAgAmoiAyADLQAAIANBzAFqLQAAczoAACACQQFqIgJBiAFHDQALIAAQDiABIAApAAA3AAAgAUEYaiAAQRhqKQAANwAAIAFBEGogAEEQaikAADcAACABQQhqIABBCGopAAA3AAAgBEEQaiQADwtBsJrAAEEXIARBCGpByJrAAEHEncAAEHkAC/UBAQN/IwBBEGsiBCQAIAAoAsgBIgJBhwFNBEAgACACakHMAWpBBjoAACACQQFqIgNBiAFHBEAgACADakHMAWpBAEGHASACaxCRARoLQQAhAiAAQQA2AsgBIABB0wJqIgMgAy0AAEGAAXI6AAADQCAAIAJqIgMgAy0AACADQcwBai0AAHM6AAAgAkEBaiICQYgBRw0ACyAAEA4gASAAKQAANwAAIAFBGGogAEEYaikAADcAACABQRBqIABBEGopAAA3AAAgAUEIaiAAQQhqKQAANwAAIARBEGokAA8LQbCawABBFyAEQQhqQciawABBhJ7AABB5AAv1AQEDfyMAQRBrIgQkACAAKALIASICQY8BTQRAIAAgAmpBzAFqQQE6AAAgAkEBaiIDQZABRwRAIAAgA2pBzAFqQQBBjwEgAmsQkQEaC0EAIQIgAEEANgLIASAAQdsCaiIDIAMtAABBgAFyOgAAA0AgACACaiIDIAMtAAAgA0HMAWotAABzOgAAIAJBAWoiAkGQAUcNAAsgABAOIAEgACkAADcAACABQRhqIABBGGooAAA2AAAgAUEQaiAAQRBqKQAANwAAIAFBCGogAEEIaikAADcAACAEQRBqJAAPC0GwmsAAQRcgBEEIakHImsAAQdiawAAQeQAL9QEBA38jAEEQayIEJAAgACgCyAEiAkGPAU0EQCAAIAJqQcwBakEGOgAAIAJBAWoiA0GQAUcEQCAAIANqQcwBakEAQY8BIAJrEJEBGgtBACECIABBADYCyAEgAEHbAmoiAyADLQAAQYABcjoAAANAIAAgAmoiAyADLQAAIANBzAFqLQAAczoAACACQQFqIgJBkAFHDQALIAAQDiABIAApAAA3AAAgAUEYaiAAQRhqKAAANgAAIAFBEGogAEEQaikAADcAACABQQhqIABBCGopAAA3AAAgBEEQaiQADwtBsJrAAEEXIARBCGpByJrAAEH0ncAAEHkAC8MBAQJ/AkACQCAAQQRqKAIAIgMgACgCCCICayABSQRAIAEgAmoiASACSQ0BIANBAXQiAiABIAIgAUsbIgFBCCABQQhLGyICQQBIDQECQCAAKAIAQQAgAxsiAUUEQCACQQEQoQEhAQwBCyACIANGDQAgA0UEQCACQQEQoQEhAQwBCyABIANBASACEJoBIQELIAFFDQIgACABNgIAIABBBGogAjYCAAsPCxCbAQALIAJBAUG0pcAAKAIAIgBBAiAAGxEAAAALhQEBBH8jAEGgAWsiAiQAIAJBADYCACACQQRyIQUDQCADIAVqIAEgA2otAAA6AAAgAiACKAIAQQFqIgQ2AgAgA0EBaiIDQcgARw0A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JAAgAkGIAWogAUHIARCLARogAiABQcwBahBuIAEoAsgBIQNB2AJBCBChASIBRQRAQdgCQQhBtKXAACgCACIAQQIgABsRAAAACyABIAJBiAFqQcgBEIsBIgEgAzYCyAEgAUHMAWogAkGIARCLARogAEGsj8AANgIEIAAgATYCACACQdACaiQAC34BAX8jAEFAaiIFJAAgBSABNgIMIAUgADYCCCAFIAM2AhQgBSACNgIQIAVBLGpBAjYCACAFQTxqQQQ2AgAgBUICNwIcIAVB8IvAADYCGCAFQQE2AjQgBSAFQTBqNgIoIAUgBUEQajYCOCAFIAVBCGo2AjAgBUEYaiAEEJABAAuVAQAgAEIANwMIIABCADcDACAAQQA2AlAgAEGQmcAAKQMANwMQIABBGGpBmJnAACkDADcDACAAQSBqQaCZwAApAwA3AwAgAEEoakGomcAAKQMANwMAIABBMGpBsJnAACkDADcDACAAQThqQbiZwAApAwA3AwAgAEFAa0HAmcAAKQMANwMAIABByABqQciZwAApAwA3AwALlQEAIABCADcDCCAAQgA3AwAgAEEANgJQIABB0JjAACkDADcDECAAQRhqQdiYwAApAwA3AwAgAEEgakHgmMAAKQMANwMAIABBKGpB6JjAACkDADcDACAAQTBqQfCYwAApAwA3AwAgAEE4akH4mMAAKQMANwMAIABBQGtBgJnAACkDADcDACAAQcgAakGImcAAKQMANwMAC20BAX8jAEEwayIDJAAgAyABNgIEIAMgADYCACADQRxqQQI2AgAgA0EsakEFNgIAIANCAjcCDCADQYiIwAA2AgggA0EFNgIkIAMgA0EgajYCGCADIAM2AiggAyADQQRqNgIgIANBCGogAhCQAQALbQEBfyMAQTBrIgMkACADIAE2AgQgAyAANgIAIANBHGpBAjYCACADQSxqQQU2AgAgA0ICNwIMIANBpIrAADYCCCADQQU2AiQgAyADQSBqNgIYIAMgA0EEajYCKCADIAM2AiAgA0EIaiACEJABAAttAQF/IwBBMGsiAyQAIAMgATYCBCADIAA2AgAgA0EcakECNgIAIANBLGpBBTYCACADQgI3AgwgA0HcisAANgIIIANBBTYCJCADIANBIGo2AhggAyADQQRqNgIoIAMgAzYCICADQQhqIAIQkAEAC3ABAX8jAEEwayICJAAgAiABNgIEIAIgADYCACACQRxqQQI2AgAgAkEsakEFNgIAIAJCAjcCDCACQcyRwAA2AgggAkEFNgIkIAIgAkEgajYCGCACIAJBBGo2AiggAiACNgIgIAJBCGpB3JHAABCQAQALVAEBfyMAQSBrIgIkACACIAAoAgA2AgQgAkEYaiABQRBqKQIANwMAIAJBEGogAUEIaikCADcDACACIAEpAgA3AwggAkEEaiACQQhqEBYgAkEgaiQAC30BAn9BASEAQeChwABB4KHAACgCAEEBajYCAAJAAkBBqKXAACgCAEEBRwRAQailwABCgYCAgBA3AwAMAQtBrKXAAEGspcAAKAIAQQFqIgA2AgAgAEECSw0BC0GwpcAAKAIAIgFBf0wNAEGwpcAAIAE2AgAgAEEBSw0AAAsAC2ICAX8BfiMAQRBrIgIkAAJAIAEEQCABKAIADQEgAUF/NgIAIAJBCGogASgCBCABQQhqKAIAKAIQEQAAIAIpAwghAyABQQA2AgAgACADNwIAIAJBEGokAA8LEJ0BAAsQngEAC0MBA38CQCACRQ0AA0AgAC0AACIEIAEtAAAiBUYEQCAAQQFqIQAgAUEBaiEBIAJBf2oiAg0BDAILCyAEIAVrIQMLIAMLSwECfwJAIAAEQCAAKAIADQEgAEEANgIAIAAoAgQhASAAKAIIIQIgABAQIAEgAigCABEEACACKAIEBEAgARAQCw8LEJ0BAAsQngEAC0gAAkAgAARAIAAoAgANASAAQX82AgAgACgCBCABIAIgAEEIaigCACgCDBECACACBEAgARAQCyAAQQA2AgAPCxCdAQALEJ4BAAtKAAJ/IAFBgIDEAEcEQEEBIAAoAhggASAAQRxqKAIAKAIQEQEADQEaCyACRQRAQQAPCyAAKAIYIAIgAyAAQRxqKAIAKAIMEQMACwtdACAAQgA3AwAgAEEANgIwIABB0JfAACkDADcDCCAAQRBqQdiXwAApAwA3AwAgAEEYakHgl8AAKQMANwMAIABBIGpB6JfAACkDADcDACAAQShqQfCXwAApAwA3AwALSAEBfyMAQSBrIgMkACADQRRqQQA2AgAgA0HIoMAANgIQIANCATcCBCADIAE2AhwgAyAANgIYIAMgA0EYajYCACADIAIQkAEAC1AAIABBADYCCCAAQgA3AwAgAEGsmMAAKQIANwJMIABB1ABqQbSYwAApAgA3AgAgAEHcAGpBvJjAACkCADcCACAAQeQAakHEmMAAKQIANwIAC1AAIABBADYCCCAAQgA3AwAgAEGMmMAAKQIANwJMIABB1ABqQZSYwAApAgA3AgAgAEHcAGpBnJjAACkCADcCACAAQeQAakGkmMAAKQIANwIACzMBAX8gAgRAIAAhAwNAIAMgAS0AADoAACABQQFqIQEgA0EBaiEDIAJBf2oiAg0ACwsgAAs1AQJ/IAAoAgAiACACEGogAEEIaiIDKAIAIgQgACgCAGogASACEIsBGiADIAIgBGo2AgBBAAsrAAJAIABBfEsNACAARQRAQQQPCyAAIABBfUlBAnQQoQEiAEUNACAADwsACz0AIABCADcDACAAQQA2AhwgAEH4l8AAKQMANwMIIABBEGpBgJjAACkDADcDACAAQRhqQYiYwAAoAgA2AgALPQAgAEEANgIcIABCADcDACAAQRhqQYiYwAAoAgA2AgAgAEEQakGAmMAAKQMANwMAIABB+JfAACkDADcDCAtMAQF/IwBBEGsiAiQAIAIgATYCDCACIAA2AgggAkGYiMAANgIEIAJByKDAADYCACACKAIIRQRAQZ2gwABBK0HIoMAAEIgBAAsQgQEACykBAX8gAgRAIAAhAwNAIAMgAToAACADQQFqIQMgAkF/aiICDQALCyAACy4AIABBADYCCCAAQgA3AwAgAEHUAGpByJfAACkCADcCACAAQcCXwAApAgA3AkwLIAACQCABQXxLDQAgACABQQQgAhCaASIARQ0AIAAPCwALHAAgASgCGEH/h8AAQQggAUEcaigCACgCDBEDAAscACABKAIYQYKMwABBBSABQRxqKAIAKAIMEQMACxQAIAAoAgAgASAAKAIEKAIMEQEACxAAIAEgACgCACAAKAIEEBILEgAgAEEAQcgBEJEBQQA2AsgBCwsAIAEEQCAAEBALCwwAIAAgASACIAMQFwsSAEHEhsAAQRFB2IbAABCIAQALDgAgACgCABoDQAwACwALDQBB76DAAEEbEKABAAsOAEGKocAAQc8AEKABAAsLACAANQIAIAEQVQsJACAAIAEQAQALGQACfyABQQlPBEAgASAAEEYMAQsgABAJCwsNAEKtqduM/5imovgACwQAQRALBABBKAsEAEEUCwUAQcAACwQA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AAAvaG9tZS9sdWNhY2Fzb25hdG8vLmNhcmdvL3JlZ2lzdHJ5L3NyYy9naXRodWIuY29tLTFlY2M2Mjk5ZGI5ZWM4MjMvYmxvY2stYnVmZmVyLTAuOS4wL3NyYy9saWIucnMvaG9tZS9sdWNhY2Fzb25hdG8vLnJ1c3R1cC90b29sY2hhaW5zL3N0YWJsZS14ODZfNjQtdW5rbm93bi1saW51eC1nbnUvbGliL3J1c3RsaWIvc3JjL3J1c3Qvc3JjL2xpYmNvcmUvc2xpY2UvbW9kLnJzAGgNEABYAAAASAAAAAEAAABoDRAAWAAAAE8AAAABAAAAaA0QAFgAAABWAAAAAQAAAGgNEABYAAAAZgAAAAEAAABoDRAAWAAAAG0AAAABAAAAaA0QAFgAAAB0AAAAAQAAAGgNEABYAAAAewAAAAEAAACQAAAA5A8QAC0AAAAREBAADAAAAFAPEAABAAAAYAAAAIgAAABoAAAASAAAAHAPEAB0AAAAEAAAAAkAAAAvaG9tZS9sdWNhY2Fzb25hdG8vLnJ1c3R1cC90b29sY2hhaW5zL3N0YWJsZS14ODZfNjQtdW5rbm93bi1saW51eC1nbnUvbGliL3J1c3RsaWIvc3JjL3J1c3Qvc3JjL2xpYmNvcmUvbWFjcm9zL21vZC5yc2Fzc2VydGlvbiBmYWlsZWQ6IGAobGVmdCA9PSByaWdodClgCiAgbGVmdDogYGAsCiByaWdodDogYGNhbGxlZCBgT3B0aW9uOjp1bndyYXAoKWAgb24gYSBgTm9uZWAgdmFsdWVYEBAAFwAAALQBAAAeAAAAc3JjL2xpYnN0ZC9wYW5pY2tpbmcucnNudWxsIHBvaW50ZXIgcGFzc2VkIHRvIHJ1c3RyZWN1cnNpdmUgdXNlIG9mIGFuIG9iamVjdCBkZXRlY3RlZCB3aGljaCB3b3VsZCBsZWFkIHRvIHVuc2FmZSBhbGlhc2luZyBpbiBydXN0AHsJcHJvZHVjZXJzAghsYW5ndWFnZQEEUnVzdAAMcHJvY2Vzc2VkLWJ5AwVydXN0Yx0xLjQ2LjAgKDA0NDg4YWZlMyAyMDIwLTA4LTI0KQZ3YWxydXMGMC4xOC4wDHdhc20tYmluZGdlbhIwLjIuNjggKGEwNGUxODk3MSk=");
let wasm;
let cachedTextDecoder = new TextDecoder("utf-8", {
    ignoreBOM: true,
    fatal: true
});
cachedTextDecoder.decode();
let cachegetUint8Memory0 = null;
function getUint8Memory0() {
    if (cachegetUint8Memory0 === null || cachegetUint8Memory0.buffer !== wasm.memory.buffer) {
        cachegetUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachegetUint8Memory0;
}
function getStringFromWasm0(ptr, len) {
    return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}
const heap = new Array(32).fill(undefined);
heap.push(undefined, null, true, false);
let heap_next = heap.length;
function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];
    heap[idx] = obj;
    return idx;
}
function getObject(idx) {
    return heap[idx];
}
function dropObject(idx) {
    if (idx < 36) return;
    heap[idx] = heap_next;
    heap_next = idx;
}
function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}
let WASM_VECTOR_LEN = 0;
let cachedTextEncoder = new TextEncoder("utf-8");
const encodeString = typeof cachedTextEncoder.encodeInto === "function" ? function(arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
} : function(arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
        read: arg.length,
        written: buf.length
    };
};
function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length);
        getUint8Memory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }
    let len = arg.length;
    let ptr = malloc(len);
    const mem = getUint8Memory0();
    let offset = 0;
    for(; offset < len; offset++){
        const code = arg.charCodeAt(offset);
        if (code > 127) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3);
        const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
        const ret = encodeString(arg, view);
        offset += ret.written;
    }
    WASM_VECTOR_LEN = offset;
    return ptr;
}
function create_hash(algorithm) {
    var ptr0 = passStringToWasm0(algorithm, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    var ret = wasm.create_hash(ptr0, len0);
    return DenoHash.__wrap(ret);
}
function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
    return instance.ptr;
}
function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1);
    getUint8Memory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}
function update_hash(hash, data) {
    _assertClass(hash, DenoHash);
    var ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    wasm.update_hash(hash.ptr, ptr0, len0);
}
let cachegetInt32Memory0 = null;
function getInt32Memory0() {
    if (cachegetInt32Memory0 === null || cachegetInt32Memory0.buffer !== wasm.memory.buffer) {
        cachegetInt32Memory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachegetInt32Memory0;
}
function getArrayU8FromWasm0(ptr, len) {
    return getUint8Memory0().subarray(ptr / 1, ptr / 1 + len);
}
function digest_hash(hash) {
    try {
        const retptr = wasm.__wbindgen_export_2.value - 16;
        wasm.__wbindgen_export_2.value = retptr;
        _assertClass(hash, DenoHash);
        wasm.digest_hash(retptr, hash.ptr);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        var v0 = getArrayU8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_free(r0, r1 * 1);
        return v0;
    } finally{
        wasm.__wbindgen_export_2.value += 16;
    }
}
class DenoHash {
    static __wrap(ptr) {
        const obj = Object.create(DenoHash.prototype);
        obj.ptr = ptr;
        return obj;
    }
    free() {
        const ptr = this.ptr;
        this.ptr = 0;
        wasm.__wbg_denohash_free(ptr);
    }
}
async function load(module, imports) {
    if (typeof Response === "function" && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === "function") {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                if (module.headers.get("Content-Type") != "application/wasm") {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
                } else {
                    throw e;
                }
            }
        }
        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);
        if (instance instanceof WebAssembly.Instance) {
            return {
                instance,
                module
            };
        } else {
            return instance;
        }
    }
}
async function init1(input) {
    if (typeof input === "undefined") {
        input = importMeta.url.replace(/\.js$/, "_bg.wasm");
    }
    const imports = {
    };
    imports.wbg = {
    };
    imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
        var ret = getStringFromWasm0(arg0, arg1);
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbindgen_rethrow = function(arg0) {
        throw takeObject(arg0);
    };
    if (typeof input === "string" || typeof Request === "function" && input instanceof Request || typeof URL === "function" && input instanceof URL) {
        input = fetch(input);
    }
    const { instance , module  } = await load(await input, imports);
    wasm = instance.exports;
    init1.__wbindgen_wasm_module = module;
    return wasm;
}
const hexTable = new TextEncoder().encode("0123456789abcdef");
function encodedLen(n) {
    return n * 2;
}
function encode1(src) {
    const dst = new Uint8Array(encodedLen(src.length));
    for(let i = 0; i < dst.length; i++){
        const v = src[i];
        dst[i * 2] = hexTable[v >> 4];
        dst[i * 2 + 1] = hexTable[v & 15];
    }
    return dst;
}
function encodeToString(src) {
    return new TextDecoder().decode(encode1(src));
}
await init1(source);
const TYPE_ERROR_MSG = "hash: `data` is invalid type";
class Hash {
    #hash;
    #digested;
    constructor(algorithm){
        this.#hash = create_hash(algorithm);
        this.#digested = false;
    }
    update(data) {
        let msg;
        if (typeof data === "string") {
            msg = new TextEncoder().encode(data);
        } else if (typeof data === "object") {
            if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
                msg = new Uint8Array(data);
            } else {
                throw new Error(TYPE_ERROR_MSG);
            }
        } else {
            throw new Error(TYPE_ERROR_MSG);
        }
        update_hash(this.#hash, msg);
        return this;
    }
    digest() {
        if (this.#digested) throw new Error("hash: already digested");
        this.#digested = true;
        return digest_hash(this.#hash);
    }
    toString(format = "hex") {
        const finalized = new Uint8Array(this.digest());
        switch(format){
            case "hex":
                return encodeToString(finalized);
            case "base64":
                return encode2(finalized);
            default:
                throw new Error("hash: invalid format");
        }
    }
}
const supportedAlgorithms = [
    "md2",
    "md4",
    "md5",
    "ripemd160",
    "ripemd320",
    "sha1",
    "sha224",
    "sha256",
    "sha384",
    "sha512",
    "sha3-224",
    "sha3-256",
    "sha3-384",
    "sha3-512",
    "keccak224",
    "keccak256",
    "keccak384",
    "keccak512", 
];
function createHash(algorithm1) {
    return new Hash(algorithm1);
}
const mod3 = function() {
    return {
        supportedAlgorithms: supportedAlgorithms,
        createHash: createHash
    };
}();
async function emptyDir(dir) {
    try {
        const items = [];
        for await (const dirEntry of Deno.readDir(dir)){
            items.push(dirEntry);
        }
        while(items.length){
            const item = items.shift();
            if (item && item.name) {
                const filepath = join3(dir, item.name);
                await Deno.remove(filepath, {
                    recursive: true
                });
            }
        }
    } catch (err) {
        if (!(err instanceof Deno.errors.NotFound)) {
            throw err;
        }
        await Deno.mkdir(dir, {
            recursive: true
        });
    }
}
function emptyDirSync(dir) {
    try {
        const items = [
            ...Deno.readDirSync(dir)
        ];
        while(items.length){
            const item = items.shift();
            if (item && item.name) {
                const filepath = join3(dir, item.name);
                Deno.removeSync(filepath, {
                    recursive: true
                });
            }
        }
    } catch (err) {
        if (!(err instanceof Deno.errors.NotFound)) {
            throw err;
        }
        Deno.mkdirSync(dir, {
            recursive: true
        });
        return;
    }
}
function isSubdir(src, dest, sep3 = sep2) {
    if (src === dest) {
        return false;
    }
    const srcArray = src.split(sep3);
    const destArray = dest.split(sep3);
    return srcArray.every((current, i)=>destArray[i] === current
    );
}
function getFileInfoType(fileInfo) {
    return fileInfo.isFile ? "file" : fileInfo.isDirectory ? "dir" : fileInfo.isSymlink ? "symlink" : undefined;
}
async function ensureDir(dir) {
    try {
        const fileInfo = await Deno.lstat(dir);
        if (!fileInfo.isDirectory) {
            throw new Error(`Ensure path exists, expected 'dir', got '${getFileInfoType(fileInfo)}'`);
        }
    } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
            await Deno.mkdir(dir, {
                recursive: true
            });
            return;
        }
        throw err;
    }
}
function ensureDirSync(dir) {
    try {
        const fileInfo = Deno.lstatSync(dir);
        if (!fileInfo.isDirectory) {
            throw new Error(`Ensure path exists, expected 'dir', got '${getFileInfoType(fileInfo)}'`);
        }
    } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
            Deno.mkdirSync(dir, {
                recursive: true
            });
            return;
        }
        throw err;
    }
}
async function ensureFile(filePath) {
    try {
        const stat = await Deno.lstat(filePath);
        if (!stat.isFile) {
            throw new Error(`Ensure path exists, expected 'file', got '${getFileInfoType(stat)}'`);
        }
    } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
            await ensureDir(dirname2(filePath));
            await Deno.writeFile(filePath, new Uint8Array());
            return;
        }
        throw err;
    }
}
function ensureFileSync(filePath) {
    try {
        const stat = Deno.lstatSync(filePath);
        if (!stat.isFile) {
            throw new Error(`Ensure path exists, expected 'file', got '${getFileInfoType(stat)}'`);
        }
    } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
            ensureDirSync(dirname2(filePath));
            Deno.writeFileSync(filePath, new Uint8Array());
            return;
        }
        throw err;
    }
}
async function exists(filePath) {
    try {
        await Deno.lstat(filePath);
        return true;
    } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
            return false;
        }
        throw err;
    }
}
function existsSync(filePath) {
    try {
        Deno.lstatSync(filePath);
        return true;
    } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
            return false;
        }
        throw err;
    }
}
async function ensureLink(src, dest) {
    if (await exists(dest)) {
        const destStatInfo = await Deno.lstat(dest);
        const destFilePathType = getFileInfoType(destStatInfo);
        if (destFilePathType !== "file") {
            throw new Error(`Ensure path exists, expected 'file', got '${destFilePathType}'`);
        }
        return;
    }
    await ensureDir(dirname2(dest));
    await Deno.link(src, dest);
}
function ensureLinkSync(src, dest) {
    if (existsSync(dest)) {
        const destStatInfo = Deno.lstatSync(dest);
        const destFilePathType = getFileInfoType(destStatInfo);
        if (destFilePathType !== "file") {
            throw new Error(`Ensure path exists, expected 'file', got '${destFilePathType}'`);
        }
        return;
    }
    ensureDirSync(dirname2(dest));
    Deno.linkSync(src, dest);
}
async function ensureSymlink(src, dest) {
    const srcStatInfo = await Deno.lstat(src);
    const srcFilePathType = getFileInfoType(srcStatInfo);
    if (await exists(dest)) {
        const destStatInfo = await Deno.lstat(dest);
        const destFilePathType = getFileInfoType(destStatInfo);
        if (destFilePathType !== "symlink") {
            throw new Error(`Ensure path exists, expected 'symlink', got '${destFilePathType}'`);
        }
        return;
    }
    await ensureDir(dirname2(dest));
    const options = isWindows ? {
        type: srcFilePathType === "dir" ? "dir" : "file"
    } : undefined;
    await Deno.symlink(src, dest, options);
}
function ensureSymlinkSync(src, dest) {
    const srcStatInfo = Deno.lstatSync(src);
    const srcFilePathType = getFileInfoType(srcStatInfo);
    if (existsSync(dest)) {
        const destStatInfo = Deno.lstatSync(dest);
        const destFilePathType = getFileInfoType(destStatInfo);
        if (destFilePathType !== "symlink") {
            throw new Error(`Ensure path exists, expected 'symlink', got '${destFilePathType}'`);
        }
        return;
    }
    ensureDirSync(dirname2(dest));
    const options = isWindows ? {
        type: srcFilePathType === "dir" ? "dir" : "file"
    } : undefined;
    Deno.symlinkSync(src, dest, options);
}
function _createWalkEntrySync(path2) {
    path2 = normalize3(path2);
    const name = basename2(path2);
    const info = Deno.statSync(path2);
    return {
        path: path2,
        name,
        isFile: info.isFile,
        isDirectory: info.isDirectory,
        isSymlink: info.isSymlink
    };
}
async function _createWalkEntry(path2) {
    path2 = normalize3(path2);
    const name = basename2(path2);
    const info = await Deno.stat(path2);
    return {
        path: path2,
        name,
        isFile: info.isFile,
        isDirectory: info.isDirectory,
        isSymlink: info.isSymlink
    };
}
function include(path2, exts, match, skip) {
    if (exts && !exts.some((ext)=>path2.endsWith(ext)
    )) {
        return false;
    }
    if (match && !match.some((pattern)=>!!path2.match(pattern)
    )) {
        return false;
    }
    if (skip && skip.some((pattern)=>!!path2.match(pattern)
    )) {
        return false;
    }
    return true;
}
async function* walk(root, { maxDepth =Infinity , includeFiles =true , includeDirs =true , followSymlinks =false , exts =undefined , match =undefined , skip =undefined  } = {
}) {
    if (maxDepth < 0) {
        return;
    }
    if (includeDirs && include(root, exts, match, skip)) {
        yield await _createWalkEntry(root);
    }
    if (maxDepth < 1 || !include(root, undefined, undefined, skip)) {
        return;
    }
    for await (const entry of Deno.readDir(root)){
        assert(entry.name != null);
        let path2 = join3(root, entry.name);
        if (entry.isSymlink) {
            if (followSymlinks) {
                path2 = await Deno.realPath(path2);
            } else {
                continue;
            }
        }
        if (entry.isFile) {
            if (includeFiles && include(path2, exts, match, skip)) {
                yield {
                    path: path2,
                    ...entry
                };
            }
        } else {
            yield* walk(path2, {
                maxDepth: maxDepth - 1,
                includeFiles,
                includeDirs,
                followSymlinks,
                exts,
                match,
                skip
            });
        }
    }
}
function* walkSync(root, { maxDepth =Infinity , includeFiles =true , includeDirs =true , followSymlinks =false , exts =undefined , match =undefined , skip =undefined  } = {
}) {
    if (maxDepth < 0) {
        return;
    }
    if (includeDirs && include(root, exts, match, skip)) {
        yield _createWalkEntrySync(root);
    }
    if (maxDepth < 1 || !include(root, undefined, undefined, skip)) {
        return;
    }
    for (const entry of Deno.readDirSync(root)){
        assert(entry.name != null);
        let path2 = join3(root, entry.name);
        if (entry.isSymlink) {
            if (followSymlinks) {
                path2 = Deno.realPathSync(path2);
            } else {
                continue;
            }
        }
        if (entry.isFile) {
            if (includeFiles && include(path2, exts, match, skip)) {
                yield {
                    path: path2,
                    ...entry
                };
            }
        } else {
            yield* walkSync(path2, {
                maxDepth: maxDepth - 1,
                includeFiles,
                includeDirs,
                followSymlinks,
                exts,
                match,
                skip
            });
        }
    }
}
function split(path2) {
    const s = SEP_PATTERN.source;
    const segments = path2.replace(new RegExp(`^${s}|${s}$`, "g"), "").split(SEP_PATTERN);
    const isAbsolute_ = isAbsolute2(path2);
    return {
        segments,
        isAbsolute: isAbsolute_,
        hasTrailingSep: !!path2.match(new RegExp(`${s}$`)),
        winRoot: isWindows && isAbsolute_ ? segments.shift() : undefined
    };
}
function throwUnlessNotFound(error) {
    if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
    }
}
function comparePath(a, b) {
    if (a.path < b.path) return -1;
    if (a.path > b.path) return 1;
    return 0;
}
async function* expandGlob(glob, { root =Deno.cwd() , exclude =[] , includeDirs =true , extended =false , globstar =false , caseInsensitive  } = {
}) {
    const globOptions = {
        extended,
        globstar,
        caseInsensitive
    };
    const absRoot = isAbsolute2(root) ? normalize3(root) : joinGlobs([
        Deno.cwd(),
        root
    ], globOptions);
    const resolveFromRoot = (path2)=>isAbsolute2(path2) ? normalize3(path2) : joinGlobs([
            absRoot,
            path2
        ], globOptions)
    ;
    const excludePatterns = exclude.map(resolveFromRoot).map((s)=>globToRegExp(s, globOptions)
    );
    const shouldInclude = (path2)=>!excludePatterns.some((p)=>!!path2.match(p)
        )
    ;
    const { segments , hasTrailingSep , winRoot  } = split(resolveFromRoot(glob));
    let fixedRoot = winRoot != undefined ? winRoot : "/";
    while(segments.length > 0 && !isGlob(segments[0])){
        const seg = segments.shift();
        assert(seg != null);
        fixedRoot = joinGlobs([
            fixedRoot,
            seg
        ], globOptions);
    }
    let fixedRootInfo;
    try {
        fixedRootInfo = await _createWalkEntry(fixedRoot);
    } catch (error) {
        return throwUnlessNotFound(error);
    }
    async function* advanceMatch(walkInfo, globSegment) {
        if (!walkInfo.isDirectory) {
            return;
        } else if (globSegment == "..") {
            const parentPath = joinGlobs([
                walkInfo.path,
                ".."
            ], globOptions);
            try {
                if (shouldInclude(parentPath)) {
                    return yield await _createWalkEntry(parentPath);
                }
            } catch (error) {
                throwUnlessNotFound(error);
            }
            return;
        } else if (globSegment == "**") {
            return yield* walk(walkInfo.path, {
                includeFiles: false,
                skip: excludePatterns
            });
        }
        yield* walk(walkInfo.path, {
            maxDepth: 1,
            match: [
                globToRegExp(joinGlobs([
                    walkInfo.path,
                    globSegment
                ], globOptions), globOptions), 
            ],
            skip: excludePatterns
        });
    }
    let currentMatches = [
        fixedRootInfo
    ];
    for (const segment of segments){
        const nextMatchMap = new Map();
        for (const currentMatch of currentMatches){
            for await (const nextMatch of advanceMatch(currentMatch, segment)){
                nextMatchMap.set(nextMatch.path, nextMatch);
            }
        }
        currentMatches = [
            ...nextMatchMap.values()
        ].sort(comparePath);
    }
    if (hasTrailingSep) {
        currentMatches = currentMatches.filter((entry)=>entry.isDirectory
        );
    }
    if (!includeDirs) {
        currentMatches = currentMatches.filter((entry)=>!entry.isDirectory
        );
    }
    yield* currentMatches;
}
function* expandGlobSync(glob, { root =Deno.cwd() , exclude =[] , includeDirs =true , extended =false , globstar =false , caseInsensitive  } = {
}) {
    const globOptions = {
        extended,
        globstar,
        caseInsensitive
    };
    const absRoot = isAbsolute2(root) ? normalize3(root) : joinGlobs([
        Deno.cwd(),
        root
    ], globOptions);
    const resolveFromRoot = (path2)=>isAbsolute2(path2) ? normalize3(path2) : joinGlobs([
            absRoot,
            path2
        ], globOptions)
    ;
    const excludePatterns = exclude.map(resolveFromRoot).map((s)=>globToRegExp(s, globOptions)
    );
    const shouldInclude = (path2)=>!excludePatterns.some((p)=>!!path2.match(p)
        )
    ;
    const { segments , hasTrailingSep , winRoot  } = split(resolveFromRoot(glob));
    let fixedRoot = winRoot != undefined ? winRoot : "/";
    while(segments.length > 0 && !isGlob(segments[0])){
        const seg = segments.shift();
        assert(seg != null);
        fixedRoot = joinGlobs([
            fixedRoot,
            seg
        ], globOptions);
    }
    let fixedRootInfo;
    try {
        fixedRootInfo = _createWalkEntrySync(fixedRoot);
    } catch (error) {
        return throwUnlessNotFound(error);
    }
    function* advanceMatch(walkInfo, globSegment) {
        if (!walkInfo.isDirectory) {
            return;
        } else if (globSegment == "..") {
            const parentPath = joinGlobs([
                walkInfo.path,
                ".."
            ], globOptions);
            try {
                if (shouldInclude(parentPath)) {
                    return yield _createWalkEntrySync(parentPath);
                }
            } catch (error) {
                throwUnlessNotFound(error);
            }
            return;
        } else if (globSegment == "**") {
            return yield* walkSync(walkInfo.path, {
                includeFiles: false,
                skip: excludePatterns
            });
        }
        yield* walkSync(walkInfo.path, {
            maxDepth: 1,
            match: [
                globToRegExp(joinGlobs([
                    walkInfo.path,
                    globSegment
                ], globOptions), globOptions), 
            ],
            skip: excludePatterns
        });
    }
    let currentMatches = [
        fixedRootInfo
    ];
    for (const segment of segments){
        const nextMatchMap = new Map();
        for (const currentMatch of currentMatches){
            for (const nextMatch of advanceMatch(currentMatch, segment)){
                nextMatchMap.set(nextMatch.path, nextMatch);
            }
        }
        currentMatches = [
            ...nextMatchMap.values()
        ].sort(comparePath);
    }
    if (hasTrailingSep) {
        currentMatches = currentMatches.filter((entry)=>entry.isDirectory
        );
    }
    if (!includeDirs) {
        currentMatches = currentMatches.filter((entry)=>!entry.isDirectory
        );
    }
    yield* currentMatches;
}
async function move(src, dest, { overwrite =false  } = {
}) {
    const srcStat = await Deno.stat(src);
    if (srcStat.isDirectory && isSubdir(src, dest)) {
        throw new Error(`Cannot move '${src}' to a subdirectory of itself, '${dest}'.`);
    }
    if (overwrite) {
        if (await exists(dest)) {
            await Deno.remove(dest, {
                recursive: true
            });
        }
    } else {
        if (await exists(dest)) {
            throw new Error("dest already exists.");
        }
    }
    await Deno.rename(src, dest);
    return;
}
function moveSync(src, dest, { overwrite =false  } = {
}) {
    const srcStat = Deno.statSync(src);
    if (srcStat.isDirectory && isSubdir(src, dest)) {
        throw new Error(`Cannot move '${src}' to a subdirectory of itself, '${dest}'.`);
    }
    if (overwrite) {
        if (existsSync(dest)) {
            Deno.removeSync(dest, {
                recursive: true
            });
        }
    } else {
        if (existsSync(dest)) {
            throw new Error("dest already exists.");
        }
    }
    Deno.renameSync(src, dest);
}
async function ensureValidCopy(src, dest, options) {
    let destStat;
    try {
        destStat = await Deno.lstat(dest);
    } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
            return;
        }
        throw err;
    }
    if (options.isFolder && !destStat.isDirectory) {
        throw new Error(`Cannot overwrite non-directory '${dest}' with directory '${src}'.`);
    }
    if (!options.overwrite) {
        throw new Error(`'${dest}' already exists.`);
    }
    return destStat;
}
function ensureValidCopySync(src, dest, options) {
    let destStat;
    try {
        destStat = Deno.lstatSync(dest);
    } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
            return;
        }
        throw err;
    }
    if (options.isFolder && !destStat.isDirectory) {
        throw new Error(`Cannot overwrite non-directory '${dest}' with directory '${src}'.`);
    }
    if (!options.overwrite) {
        throw new Error(`'${dest}' already exists.`);
    }
    return destStat;
}
async function copyFile(src, dest, options) {
    await ensureValidCopy(src, dest, options);
    await Deno.copyFile(src, dest);
    if (options.preserveTimestamps) {
        const statInfo = await Deno.stat(src);
        assert(statInfo.atime instanceof Date, `statInfo.atime is unavailable`);
        assert(statInfo.mtime instanceof Date, `statInfo.mtime is unavailable`);
        await Deno.utime(dest, statInfo.atime, statInfo.mtime);
    }
}
function copyFileSync(src, dest, options) {
    ensureValidCopySync(src, dest, options);
    Deno.copyFileSync(src, dest);
    if (options.preserveTimestamps) {
        const statInfo = Deno.statSync(src);
        assert(statInfo.atime instanceof Date, `statInfo.atime is unavailable`);
        assert(statInfo.mtime instanceof Date, `statInfo.mtime is unavailable`);
        Deno.utimeSync(dest, statInfo.atime, statInfo.mtime);
    }
}
async function copySymLink(src, dest, options) {
    await ensureValidCopy(src, dest, options);
    const originSrcFilePath = await Deno.readLink(src);
    const type = getFileInfoType(await Deno.lstat(src));
    if (isWindows) {
        await Deno.symlink(originSrcFilePath, dest, {
            type: type === "dir" ? "dir" : "file"
        });
    } else {
        await Deno.symlink(originSrcFilePath, dest);
    }
    if (options.preserveTimestamps) {
        const statInfo = await Deno.lstat(src);
        assert(statInfo.atime instanceof Date, `statInfo.atime is unavailable`);
        assert(statInfo.mtime instanceof Date, `statInfo.mtime is unavailable`);
        await Deno.utime(dest, statInfo.atime, statInfo.mtime);
    }
}
function copySymlinkSync(src, dest, options) {
    ensureValidCopySync(src, dest, options);
    const originSrcFilePath = Deno.readLinkSync(src);
    const type = getFileInfoType(Deno.lstatSync(src));
    if (isWindows) {
        Deno.symlinkSync(originSrcFilePath, dest, {
            type: type === "dir" ? "dir" : "file"
        });
    } else {
        Deno.symlinkSync(originSrcFilePath, dest);
    }
    if (options.preserveTimestamps) {
        const statInfo = Deno.lstatSync(src);
        assert(statInfo.atime instanceof Date, `statInfo.atime is unavailable`);
        assert(statInfo.mtime instanceof Date, `statInfo.mtime is unavailable`);
        Deno.utimeSync(dest, statInfo.atime, statInfo.mtime);
    }
}
async function copyDir(src, dest, options) {
    const destStat = await ensureValidCopy(src, dest, {
        ...options,
        isFolder: true
    });
    if (!destStat) {
        await ensureDir(dest);
    }
    if (options.preserveTimestamps) {
        const srcStatInfo = await Deno.stat(src);
        assert(srcStatInfo.atime instanceof Date, `statInfo.atime is unavailable`);
        assert(srcStatInfo.mtime instanceof Date, `statInfo.mtime is unavailable`);
        await Deno.utime(dest, srcStatInfo.atime, srcStatInfo.mtime);
    }
    for await (const entry of Deno.readDir(src)){
        const srcPath = join3(src, entry.name);
        const destPath = join3(dest, basename2(srcPath));
        if (entry.isSymlink) {
            await copySymLink(srcPath, destPath, options);
        } else if (entry.isDirectory) {
            await copyDir(srcPath, destPath, options);
        } else if (entry.isFile) {
            await copyFile(srcPath, destPath, options);
        }
    }
}
function copyDirSync(src, dest, options) {
    const destStat = ensureValidCopySync(src, dest, {
        ...options,
        isFolder: true
    });
    if (!destStat) {
        ensureDirSync(dest);
    }
    if (options.preserveTimestamps) {
        const srcStatInfo = Deno.statSync(src);
        assert(srcStatInfo.atime instanceof Date, `statInfo.atime is unavailable`);
        assert(srcStatInfo.mtime instanceof Date, `statInfo.mtime is unavailable`);
        Deno.utimeSync(dest, srcStatInfo.atime, srcStatInfo.mtime);
    }
    for (const entry of Deno.readDirSync(src)){
        assert(entry.name != null, "file.name must be set");
        const srcPath = join3(src, entry.name);
        const destPath = join3(dest, basename2(srcPath));
        if (entry.isSymlink) {
            copySymlinkSync(srcPath, destPath, options);
        } else if (entry.isDirectory) {
            copyDirSync(srcPath, destPath, options);
        } else if (entry.isFile) {
            copyFileSync(srcPath, destPath, options);
        }
    }
}
async function copy(src, dest, options = {
}) {
    src = resolve2(src);
    dest = resolve2(dest);
    if (src === dest) {
        throw new Error("Source and destination cannot be the same.");
    }
    const srcStat = await Deno.lstat(src);
    if (srcStat.isDirectory && isSubdir(src, dest)) {
        throw new Error(`Cannot copy '${src}' to a subdirectory of itself, '${dest}'.`);
    }
    if (srcStat.isSymlink) {
        await copySymLink(src, dest, options);
    } else if (srcStat.isDirectory) {
        await copyDir(src, dest, options);
    } else if (srcStat.isFile) {
        await copyFile(src, dest, options);
    }
}
function copySync(src, dest, options = {
}) {
    src = resolve2(src);
    dest = resolve2(dest);
    if (src === dest) {
        throw new Error("Source and destination cannot be the same.");
    }
    const srcStat = Deno.lstatSync(src);
    if (srcStat.isDirectory && isSubdir(src, dest)) {
        throw new Error(`Cannot copy '${src}' to a subdirectory of itself, '${dest}'.`);
    }
    if (srcStat.isSymlink) {
        copySymlinkSync(src, dest, options);
    } else if (srcStat.isDirectory) {
        copyDirSync(src, dest, options);
    } else if (srcStat.isFile) {
        copyFileSync(src, dest, options);
    }
}
var EOL;
(function(EOL1) {
    EOL1["LF"] = "\n";
    EOL1["CRLF"] = "\r\n";
})(EOL || (EOL = {
}));
const regDetect = /(?:\r?\n)/g;
function detect(content) {
    const d = content.match(regDetect);
    if (!d || d.length === 0) {
        return null;
    }
    const hasCRLF = d.some((x)=>x === EOL.CRLF
    );
    return hasCRLF ? EOL.CRLF : EOL.LF;
}
function format4(content, eol) {
    return content.replace(regDetect, eol);
}
const mod4 = function() {
    return {
        emptyDir,
        emptyDirSync,
        ensureDir,
        ensureDirSync,
        ensureFile,
        ensureFileSync,
        ensureLink,
        ensureLinkSync,
        exists,
        existsSync,
        ensureSymlink,
        ensureSymlinkSync,
        expandGlob,
        expandGlobSync,
        _createWalkEntrySync,
        _createWalkEntry,
        walk,
        walkSync,
        move,
        moveSync,
        copy,
        copySync,
        EOL,
        detect,
        format: format4
    };
}();
class DenoStdInternalError1 extends Error {
    constructor(message1){
        super(message1);
        this.name = "DenoStdInternalError";
    }
}
function assert1(expr, msg = "") {
    if (!expr) {
        throw new DenoStdInternalError1(msg);
    }
}
const CHAR_FORWARD_SLASH1 = 47;
function assertPath1(path2) {
    if (typeof path2 !== "string") {
        throw new TypeError(`Path must be a string. Received ${JSON.stringify(path2)}`);
    }
}
function isPosixPathSeparator1(code) {
    return code === 47;
}
function isPathSeparator1(code) {
    return isPosixPathSeparator1(code) || code === 92;
}
function isWindowsDeviceRoot1(code) {
    return code >= 97 && code <= 122 || code >= 65 && code <= 90;
}
function normalizeString1(path2, allowAboveRoot, separator, isPathSeparator2) {
    let res = "";
    let lastSegmentLength = 0;
    let lastSlash = -1;
    let dots = 0;
    let code;
    for(let i = 0, len = path2.length; i <= len; ++i){
        if (i < len) code = path2.charCodeAt(i);
        else if (isPathSeparator2(code)) break;
        else code = CHAR_FORWARD_SLASH1;
        if (isPathSeparator2(code)) {
            if (lastSlash === i - 1 || dots === 1) {
            } else if (lastSlash !== i - 1 && dots === 2) {
                if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 || res.charCodeAt(res.length - 2) !== 46) {
                    if (res.length > 2) {
                        const lastSlashIndex = res.lastIndexOf(separator);
                        if (lastSlashIndex === -1) {
                            res = "";
                            lastSegmentLength = 0;
                        } else {
                            res = res.slice(0, lastSlashIndex);
                            lastSegmentLength = res.length - 1 - res.lastIndexOf(separator);
                        }
                        lastSlash = i;
                        dots = 0;
                        continue;
                    } else if (res.length === 2 || res.length === 1) {
                        res = "";
                        lastSegmentLength = 0;
                        lastSlash = i;
                        dots = 0;
                        continue;
                    }
                }
                if (allowAboveRoot) {
                    if (res.length > 0) res += `${separator}..`;
                    else res = "..";
                    lastSegmentLength = 2;
                }
            } else {
                if (res.length > 0) res += separator + path2.slice(lastSlash + 1, i);
                else res = path2.slice(lastSlash + 1, i);
                lastSegmentLength = i - lastSlash - 1;
            }
            lastSlash = i;
            dots = 0;
        } else if (code === 46 && dots !== -1) {
            ++dots;
        } else {
            dots = -1;
        }
    }
    return res;
}
function _format1(sep3, pathObject) {
    const dir = pathObject.dir || pathObject.root;
    const base = pathObject.base || (pathObject.name || "") + (pathObject.ext || "");
    if (!dir) return base;
    if (dir === pathObject.root) return dir + base;
    return dir + sep3 + base;
}
const WHITESPACE_ENCODINGS1 = {
    "\u0009": "%09",
    "\u000A": "%0A",
    "\u000B": "%0B",
    "\u000C": "%0C",
    "\u000D": "%0D",
    "\u0020": "%20"
};
function encodeWhitespace1(string) {
    return string.replaceAll(/[\s]/g, (c)=>{
        return WHITESPACE_ENCODINGS1[c] ?? c;
    });
}
const osType1 = (()=>{
    if (globalThis.Deno != null) {
        return Deno.build.os;
    }
    const navigator = globalThis.navigator;
    if (navigator?.appVersion?.includes?.("Win") ?? false) {
        return "windows";
    }
    return "linux";
})();
const isWindows1 = osType1 === "windows";
const sep3 = "\\";
const delimiter3 = ";";
function resolve3(...pathSegments) {
    let resolvedDevice = "";
    let resolvedTail = "";
    let resolvedAbsolute = false;
    for(let i = pathSegments.length - 1; i >= -1; i--){
        let path2;
        if (i >= 0) {
            path2 = pathSegments[i];
        } else if (!resolvedDevice) {
            if (globalThis.Deno == null) {
                throw new TypeError("Resolved a drive-letter-less path without a CWD.");
            }
            path2 = Deno.cwd();
        } else {
            if (globalThis.Deno == null) {
                throw new TypeError("Resolved a relative path without a CWD.");
            }
            path2 = Deno.env.get(`=${resolvedDevice}`) || Deno.cwd();
            if (path2 === undefined || path2.slice(0, 3).toLowerCase() !== `${resolvedDevice.toLowerCase()}\\`) {
                path2 = `${resolvedDevice}\\`;
            }
        }
        assertPath1(path2);
        const len = path2.length;
        if (len === 0) continue;
        let rootEnd = 0;
        let device = "";
        let isAbsolute3 = false;
        const code = path2.charCodeAt(0);
        if (len > 1) {
            if (isPathSeparator1(code)) {
                isAbsolute3 = true;
                if (isPathSeparator1(path2.charCodeAt(1))) {
                    let j = 2;
                    let last = j;
                    for(; j < len; ++j){
                        if (isPathSeparator1(path2.charCodeAt(j))) break;
                    }
                    if (j < len && j !== last) {
                        const firstPart = path2.slice(last, j);
                        last = j;
                        for(; j < len; ++j){
                            if (!isPathSeparator1(path2.charCodeAt(j))) break;
                        }
                        if (j < len && j !== last) {
                            last = j;
                            for(; j < len; ++j){
                                if (isPathSeparator1(path2.charCodeAt(j))) break;
                            }
                            if (j === len) {
                                device = `\\\\${firstPart}\\${path2.slice(last)}`;
                                rootEnd = j;
                            } else if (j !== last) {
                                device = `\\\\${firstPart}\\${path2.slice(last, j)}`;
                                rootEnd = j;
                            }
                        }
                    }
                } else {
                    rootEnd = 1;
                }
            } else if (isWindowsDeviceRoot1(code)) {
                if (path2.charCodeAt(1) === 58) {
                    device = path2.slice(0, 2);
                    rootEnd = 2;
                    if (len > 2) {
                        if (isPathSeparator1(path2.charCodeAt(2))) {
                            isAbsolute3 = true;
                            rootEnd = 3;
                        }
                    }
                }
            }
        } else if (isPathSeparator1(code)) {
            rootEnd = 1;
            isAbsolute3 = true;
        }
        if (device.length > 0 && resolvedDevice.length > 0 && device.toLowerCase() !== resolvedDevice.toLowerCase()) {
            continue;
        }
        if (resolvedDevice.length === 0 && device.length > 0) {
            resolvedDevice = device;
        }
        if (!resolvedAbsolute) {
            resolvedTail = `${path2.slice(rootEnd)}\\${resolvedTail}`;
            resolvedAbsolute = isAbsolute3;
        }
        if (resolvedAbsolute && resolvedDevice.length > 0) break;
    }
    resolvedTail = normalizeString1(resolvedTail, !resolvedAbsolute, "\\", isPathSeparator1);
    return resolvedDevice + (resolvedAbsolute ? "\\" : "") + resolvedTail || ".";
}
function normalize4(path2) {
    assertPath1(path2);
    const len = path2.length;
    if (len === 0) return ".";
    let rootEnd = 0;
    let device;
    let isAbsolute3 = false;
    const code = path2.charCodeAt(0);
    if (len > 1) {
        if (isPathSeparator1(code)) {
            isAbsolute3 = true;
            if (isPathSeparator1(path2.charCodeAt(1))) {
                let j = 2;
                let last = j;
                for(; j < len; ++j){
                    if (isPathSeparator1(path2.charCodeAt(j))) break;
                }
                if (j < len && j !== last) {
                    const firstPart = path2.slice(last, j);
                    last = j;
                    for(; j < len; ++j){
                        if (!isPathSeparator1(path2.charCodeAt(j))) break;
                    }
                    if (j < len && j !== last) {
                        last = j;
                        for(; j < len; ++j){
                            if (isPathSeparator1(path2.charCodeAt(j))) break;
                        }
                        if (j === len) {
                            return `\\\\${firstPart}\\${path2.slice(last)}\\`;
                        } else if (j !== last) {
                            device = `\\\\${firstPart}\\${path2.slice(last, j)}`;
                            rootEnd = j;
                        }
                    }
                }
            } else {
                rootEnd = 1;
            }
        } else if (isWindowsDeviceRoot1(code)) {
            if (path2.charCodeAt(1) === 58) {
                device = path2.slice(0, 2);
                rootEnd = 2;
                if (len > 2) {
                    if (isPathSeparator1(path2.charCodeAt(2))) {
                        isAbsolute3 = true;
                        rootEnd = 3;
                    }
                }
            }
        }
    } else if (isPathSeparator1(code)) {
        return "\\";
    }
    let tail;
    if (rootEnd < len) {
        tail = normalizeString1(path2.slice(rootEnd), !isAbsolute3, "\\", isPathSeparator1);
    } else {
        tail = "";
    }
    if (tail.length === 0 && !isAbsolute3) tail = ".";
    if (tail.length > 0 && isPathSeparator1(path2.charCodeAt(len - 1))) {
        tail += "\\";
    }
    if (device === undefined) {
        if (isAbsolute3) {
            if (tail.length > 0) return `\\${tail}`;
            else return "\\";
        } else if (tail.length > 0) {
            return tail;
        } else {
            return "";
        }
    } else if (isAbsolute3) {
        if (tail.length > 0) return `${device}\\${tail}`;
        else return `${device}\\`;
    } else if (tail.length > 0) {
        return device + tail;
    } else {
        return device;
    }
}
function isAbsolute3(path2) {
    assertPath1(path2);
    const len = path2.length;
    if (len === 0) return false;
    const code = path2.charCodeAt(0);
    if (isPathSeparator1(code)) {
        return true;
    } else if (isWindowsDeviceRoot1(code)) {
        if (len > 2 && path2.charCodeAt(1) === 58) {
            if (isPathSeparator1(path2.charCodeAt(2))) return true;
        }
    }
    return false;
}
function join4(...paths) {
    const pathsCount = paths.length;
    if (pathsCount === 0) return ".";
    let joined;
    let firstPart = null;
    for(let i = 0; i < pathsCount; ++i){
        const path2 = paths[i];
        assertPath1(path2);
        if (path2.length > 0) {
            if (joined === undefined) joined = firstPart = path2;
            else joined += `\\${path2}`;
        }
    }
    if (joined === undefined) return ".";
    let needsReplace = true;
    let slashCount = 0;
    assert1(firstPart != null);
    if (isPathSeparator1(firstPart.charCodeAt(0))) {
        ++slashCount;
        const firstLen = firstPart.length;
        if (firstLen > 1) {
            if (isPathSeparator1(firstPart.charCodeAt(1))) {
                ++slashCount;
                if (firstLen > 2) {
                    if (isPathSeparator1(firstPart.charCodeAt(2))) ++slashCount;
                    else {
                        needsReplace = false;
                    }
                }
            }
        }
    }
    if (needsReplace) {
        for(; slashCount < joined.length; ++slashCount){
            if (!isPathSeparator1(joined.charCodeAt(slashCount))) break;
        }
        if (slashCount >= 2) joined = `\\${joined.slice(slashCount)}`;
    }
    return normalize4(joined);
}
function relative3(from, to) {
    assertPath1(from);
    assertPath1(to);
    if (from === to) return "";
    const fromOrig = resolve3(from);
    const toOrig = resolve3(to);
    if (fromOrig === toOrig) return "";
    from = fromOrig.toLowerCase();
    to = toOrig.toLowerCase();
    if (from === to) return "";
    let fromStart = 0;
    let fromEnd = from.length;
    for(; fromStart < fromEnd; ++fromStart){
        if (from.charCodeAt(fromStart) !== 92) break;
    }
    for(; fromEnd - 1 > fromStart; --fromEnd){
        if (from.charCodeAt(fromEnd - 1) !== 92) break;
    }
    const fromLen = fromEnd - fromStart;
    let toStart = 0;
    let toEnd = to.length;
    for(; toStart < toEnd; ++toStart){
        if (to.charCodeAt(toStart) !== 92) break;
    }
    for(; toEnd - 1 > toStart; --toEnd){
        if (to.charCodeAt(toEnd - 1) !== 92) break;
    }
    const toLen = toEnd - toStart;
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i = 0;
    for(; i <= length; ++i){
        if (i === length) {
            if (toLen > length) {
                if (to.charCodeAt(toStart + i) === 92) {
                    return toOrig.slice(toStart + i + 1);
                } else if (i === 2) {
                    return toOrig.slice(toStart + i);
                }
            }
            if (fromLen > length) {
                if (from.charCodeAt(fromStart + i) === 92) {
                    lastCommonSep = i;
                } else if (i === 2) {
                    lastCommonSep = 3;
                }
            }
            break;
        }
        const fromCode = from.charCodeAt(fromStart + i);
        const toCode = to.charCodeAt(toStart + i);
        if (fromCode !== toCode) break;
        else if (fromCode === 92) lastCommonSep = i;
    }
    if (i !== length && lastCommonSep === -1) {
        return toOrig;
    }
    let out = "";
    if (lastCommonSep === -1) lastCommonSep = 0;
    for(i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i){
        if (i === fromEnd || from.charCodeAt(i) === 92) {
            if (out.length === 0) out += "..";
            else out += "\\..";
        }
    }
    if (out.length > 0) {
        return out + toOrig.slice(toStart + lastCommonSep, toEnd);
    } else {
        toStart += lastCommonSep;
        if (toOrig.charCodeAt(toStart) === 92) ++toStart;
        return toOrig.slice(toStart, toEnd);
    }
}
function toNamespacedPath3(path2) {
    if (typeof path2 !== "string") return path2;
    if (path2.length === 0) return "";
    const resolvedPath = resolve3(path2);
    if (resolvedPath.length >= 3) {
        if (resolvedPath.charCodeAt(0) === 92) {
            if (resolvedPath.charCodeAt(1) === 92) {
                const code = resolvedPath.charCodeAt(2);
                if (code !== 63 && code !== 46) {
                    return `\\\\?\\UNC\\${resolvedPath.slice(2)}`;
                }
            }
        } else if (isWindowsDeviceRoot1(resolvedPath.charCodeAt(0))) {
            if (resolvedPath.charCodeAt(1) === 58 && resolvedPath.charCodeAt(2) === 92) {
                return `\\\\?\\${resolvedPath}`;
            }
        }
    }
    return path2;
}
function dirname3(path2) {
    assertPath1(path2);
    const len = path2.length;
    if (len === 0) return ".";
    let rootEnd = -1;
    let end = -1;
    let matchedSlash = true;
    let offset = 0;
    const code = path2.charCodeAt(0);
    if (len > 1) {
        if (isPathSeparator1(code)) {
            rootEnd = offset = 1;
            if (isPathSeparator1(path2.charCodeAt(1))) {
                let j = 2;
                let last = j;
                for(; j < len; ++j){
                    if (isPathSeparator1(path2.charCodeAt(j))) break;
                }
                if (j < len && j !== last) {
                    last = j;
                    for(; j < len; ++j){
                        if (!isPathSeparator1(path2.charCodeAt(j))) break;
                    }
                    if (j < len && j !== last) {
                        last = j;
                        for(; j < len; ++j){
                            if (isPathSeparator1(path2.charCodeAt(j))) break;
                        }
                        if (j === len) {
                            return path2;
                        }
                        if (j !== last) {
                            rootEnd = offset = j + 1;
                        }
                    }
                }
            }
        } else if (isWindowsDeviceRoot1(code)) {
            if (path2.charCodeAt(1) === 58) {
                rootEnd = offset = 2;
                if (len > 2) {
                    if (isPathSeparator1(path2.charCodeAt(2))) rootEnd = offset = 3;
                }
            }
        }
    } else if (isPathSeparator1(code)) {
        return path2;
    }
    for(let i = len - 1; i >= offset; --i){
        if (isPathSeparator1(path2.charCodeAt(i))) {
            if (!matchedSlash) {
                end = i;
                break;
            }
        } else {
            matchedSlash = false;
        }
    }
    if (end === -1) {
        if (rootEnd === -1) return ".";
        else end = rootEnd;
    }
    return path2.slice(0, end);
}
function basename3(path2, ext = "") {
    if (ext !== undefined && typeof ext !== "string") {
        throw new TypeError('"ext" argument must be a string');
    }
    assertPath1(path2);
    let start = 0;
    let end = -1;
    let matchedSlash = true;
    let i;
    if (path2.length >= 2) {
        const drive = path2.charCodeAt(0);
        if (isWindowsDeviceRoot1(drive)) {
            if (path2.charCodeAt(1) === 58) start = 2;
        }
    }
    if (ext !== undefined && ext.length > 0 && ext.length <= path2.length) {
        if (ext.length === path2.length && ext === path2) return "";
        let extIdx = ext.length - 1;
        let firstNonSlashEnd = -1;
        for(i = path2.length - 1; i >= start; --i){
            const code = path2.charCodeAt(i);
            if (isPathSeparator1(code)) {
                if (!matchedSlash) {
                    start = i + 1;
                    break;
                }
            } else {
                if (firstNonSlashEnd === -1) {
                    matchedSlash = false;
                    firstNonSlashEnd = i + 1;
                }
                if (extIdx >= 0) {
                    if (code === ext.charCodeAt(extIdx)) {
                        if ((--extIdx) === -1) {
                            end = i;
                        }
                    } else {
                        extIdx = -1;
                        end = firstNonSlashEnd;
                    }
                }
            }
        }
        if (start === end) end = firstNonSlashEnd;
        else if (end === -1) end = path2.length;
        return path2.slice(start, end);
    } else {
        for(i = path2.length - 1; i >= start; --i){
            if (isPathSeparator1(path2.charCodeAt(i))) {
                if (!matchedSlash) {
                    start = i + 1;
                    break;
                }
            } else if (end === -1) {
                matchedSlash = false;
                end = i + 1;
            }
        }
        if (end === -1) return "";
        return path2.slice(start, end);
    }
}
function extname3(path2) {
    assertPath1(path2);
    let start = 0;
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let preDotState = 0;
    if (path2.length >= 2 && path2.charCodeAt(1) === 58 && isWindowsDeviceRoot1(path2.charCodeAt(0))) {
        start = startPart = 2;
    }
    for(let i = path2.length - 1; i >= start; --i){
        const code = path2.charCodeAt(i);
        if (isPathSeparator1(code)) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        return "";
    }
    return path2.slice(startDot, end);
}
function format5(pathObject) {
    if (pathObject === null || typeof pathObject !== "object") {
        throw new TypeError(`The "pathObject" argument must be of type Object. Received type ${typeof pathObject}`);
    }
    return _format1("\\", pathObject);
}
function parse3(path2) {
    assertPath1(path2);
    const ret = {
        root: "",
        dir: "",
        base: "",
        ext: "",
        name: ""
    };
    const len = path2.length;
    if (len === 0) return ret;
    let rootEnd = 0;
    let code = path2.charCodeAt(0);
    if (len > 1) {
        if (isPathSeparator1(code)) {
            rootEnd = 1;
            if (isPathSeparator1(path2.charCodeAt(1))) {
                let j = 2;
                let last = j;
                for(; j < len; ++j){
                    if (isPathSeparator1(path2.charCodeAt(j))) break;
                }
                if (j < len && j !== last) {
                    last = j;
                    for(; j < len; ++j){
                        if (!isPathSeparator1(path2.charCodeAt(j))) break;
                    }
                    if (j < len && j !== last) {
                        last = j;
                        for(; j < len; ++j){
                            if (isPathSeparator1(path2.charCodeAt(j))) break;
                        }
                        if (j === len) {
                            rootEnd = j;
                        } else if (j !== last) {
                            rootEnd = j + 1;
                        }
                    }
                }
            }
        } else if (isWindowsDeviceRoot1(code)) {
            if (path2.charCodeAt(1) === 58) {
                rootEnd = 2;
                if (len > 2) {
                    if (isPathSeparator1(path2.charCodeAt(2))) {
                        if (len === 3) {
                            ret.root = ret.dir = path2;
                            return ret;
                        }
                        rootEnd = 3;
                    }
                } else {
                    ret.root = ret.dir = path2;
                    return ret;
                }
            }
        }
    } else if (isPathSeparator1(code)) {
        ret.root = ret.dir = path2;
        return ret;
    }
    if (rootEnd > 0) ret.root = path2.slice(0, rootEnd);
    let startDot = -1;
    let startPart = rootEnd;
    let end = -1;
    let matchedSlash = true;
    let i = path2.length - 1;
    let preDotState = 0;
    for(; i >= rootEnd; --i){
        code = path2.charCodeAt(i);
        if (isPathSeparator1(code)) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        if (end !== -1) {
            ret.base = ret.name = path2.slice(startPart, end);
        }
    } else {
        ret.name = path2.slice(startPart, startDot);
        ret.base = path2.slice(startPart, end);
        ret.ext = path2.slice(startDot, end);
    }
    if (startPart > 0 && startPart !== rootEnd) {
        ret.dir = path2.slice(0, startPart - 1);
    } else ret.dir = ret.root;
    return ret;
}
function fromFileUrl3(url) {
    url = url instanceof URL ? url : new URL(url);
    if (url.protocol != "file:") {
        throw new TypeError("Must be a file URL.");
    }
    let path2 = decodeURIComponent(url.pathname.replace(/\//g, "\\").replace(/%(?![0-9A-Fa-f]{2})/g, "%25")).replace(/^\\*([A-Za-z]:)(\\|$)/, "$1\\");
    if (url.hostname != "") {
        path2 = `\\\\${url.hostname}${path2}`;
    }
    return path2;
}
function toFileUrl3(path2) {
    if (!isAbsolute3(path2)) {
        throw new TypeError("Must be an absolute path.");
    }
    const [, hostname, pathname] = path2.match(/^(?:[/\\]{2}([^/\\]+)(?=[/\\](?:[^/\\]|$)))?(.*)/);
    const url = new URL("file:///");
    url.pathname = encodeWhitespace1(pathname.replace(/%/g, "%25"));
    if (hostname != null && hostname != "localhost") {
        url.hostname = hostname;
        if (!url.hostname) {
            throw new TypeError("Invalid hostname.");
        }
    }
    return url;
}
const mod5 = function() {
    return {
        sep: sep3,
        delimiter: delimiter3,
        resolve: resolve3,
        normalize: normalize4,
        isAbsolute: isAbsolute3,
        join: join4,
        relative: relative3,
        toNamespacedPath: toNamespacedPath3,
        dirname: dirname3,
        basename: basename3,
        extname: extname3,
        format: format5,
        parse: parse3,
        fromFileUrl: fromFileUrl3,
        toFileUrl: toFileUrl3
    };
}();
const sep4 = "/";
const delimiter4 = ":";
function resolve4(...pathSegments) {
    let resolvedPath = "";
    let resolvedAbsolute = false;
    for(let i = pathSegments.length - 1; i >= -1 && !resolvedAbsolute; i--){
        let path2;
        if (i >= 0) path2 = pathSegments[i];
        else {
            if (globalThis.Deno == null) {
                throw new TypeError("Resolved a relative path without a CWD.");
            }
            path2 = Deno.cwd();
        }
        assertPath1(path2);
        if (path2.length === 0) {
            continue;
        }
        resolvedPath = `${path2}/${resolvedPath}`;
        resolvedAbsolute = path2.charCodeAt(0) === CHAR_FORWARD_SLASH1;
    }
    resolvedPath = normalizeString1(resolvedPath, !resolvedAbsolute, "/", isPosixPathSeparator1);
    if (resolvedAbsolute) {
        if (resolvedPath.length > 0) return `/${resolvedPath}`;
        else return "/";
    } else if (resolvedPath.length > 0) return resolvedPath;
    else return ".";
}
function normalize5(path2) {
    assertPath1(path2);
    if (path2.length === 0) return ".";
    const isAbsolute4 = path2.charCodeAt(0) === 47;
    const trailingSeparator = path2.charCodeAt(path2.length - 1) === 47;
    path2 = normalizeString1(path2, !isAbsolute4, "/", isPosixPathSeparator1);
    if (path2.length === 0 && !isAbsolute4) path2 = ".";
    if (path2.length > 0 && trailingSeparator) path2 += "/";
    if (isAbsolute4) return `/${path2}`;
    return path2;
}
function isAbsolute4(path2) {
    assertPath1(path2);
    return path2.length > 0 && path2.charCodeAt(0) === 47;
}
function join5(...paths) {
    if (paths.length === 0) return ".";
    let joined;
    for(let i = 0, len = paths.length; i < len; ++i){
        const path2 = paths[i];
        assertPath1(path2);
        if (path2.length > 0) {
            if (!joined) joined = path2;
            else joined += `/${path2}`;
        }
    }
    if (!joined) return ".";
    return normalize5(joined);
}
function relative4(from, to) {
    assertPath1(from);
    assertPath1(to);
    if (from === to) return "";
    from = resolve4(from);
    to = resolve4(to);
    if (from === to) return "";
    let fromStart = 1;
    const fromEnd = from.length;
    for(; fromStart < fromEnd; ++fromStart){
        if (from.charCodeAt(fromStart) !== 47) break;
    }
    const fromLen = fromEnd - fromStart;
    let toStart = 1;
    const toEnd = to.length;
    for(; toStart < toEnd; ++toStart){
        if (to.charCodeAt(toStart) !== 47) break;
    }
    const toLen = toEnd - toStart;
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i = 0;
    for(; i <= length; ++i){
        if (i === length) {
            if (toLen > length) {
                if (to.charCodeAt(toStart + i) === 47) {
                    return to.slice(toStart + i + 1);
                } else if (i === 0) {
                    return to.slice(toStart + i);
                }
            } else if (fromLen > length) {
                if (from.charCodeAt(fromStart + i) === 47) {
                    lastCommonSep = i;
                } else if (i === 0) {
                    lastCommonSep = 0;
                }
            }
            break;
        }
        const fromCode = from.charCodeAt(fromStart + i);
        const toCode = to.charCodeAt(toStart + i);
        if (fromCode !== toCode) break;
        else if (fromCode === 47) lastCommonSep = i;
    }
    let out = "";
    for(i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i){
        if (i === fromEnd || from.charCodeAt(i) === 47) {
            if (out.length === 0) out += "..";
            else out += "/..";
        }
    }
    if (out.length > 0) return out + to.slice(toStart + lastCommonSep);
    else {
        toStart += lastCommonSep;
        if (to.charCodeAt(toStart) === 47) ++toStart;
        return to.slice(toStart);
    }
}
function toNamespacedPath4(path2) {
    return path2;
}
function dirname4(path2) {
    assertPath1(path2);
    if (path2.length === 0) return ".";
    const hasRoot = path2.charCodeAt(0) === 47;
    let end = -1;
    let matchedSlash = true;
    for(let i = path2.length - 1; i >= 1; --i){
        if (path2.charCodeAt(i) === 47) {
            if (!matchedSlash) {
                end = i;
                break;
            }
        } else {
            matchedSlash = false;
        }
    }
    if (end === -1) return hasRoot ? "/" : ".";
    if (hasRoot && end === 1) return "//";
    return path2.slice(0, end);
}
function basename4(path2, ext = "") {
    if (ext !== undefined && typeof ext !== "string") {
        throw new TypeError('"ext" argument must be a string');
    }
    assertPath1(path2);
    let start = 0;
    let end = -1;
    let matchedSlash = true;
    let i;
    if (ext !== undefined && ext.length > 0 && ext.length <= path2.length) {
        if (ext.length === path2.length && ext === path2) return "";
        let extIdx = ext.length - 1;
        let firstNonSlashEnd = -1;
        for(i = path2.length - 1; i >= 0; --i){
            const code = path2.charCodeAt(i);
            if (code === 47) {
                if (!matchedSlash) {
                    start = i + 1;
                    break;
                }
            } else {
                if (firstNonSlashEnd === -1) {
                    matchedSlash = false;
                    firstNonSlashEnd = i + 1;
                }
                if (extIdx >= 0) {
                    if (code === ext.charCodeAt(extIdx)) {
                        if ((--extIdx) === -1) {
                            end = i;
                        }
                    } else {
                        extIdx = -1;
                        end = firstNonSlashEnd;
                    }
                }
            }
        }
        if (start === end) end = firstNonSlashEnd;
        else if (end === -1) end = path2.length;
        return path2.slice(start, end);
    } else {
        for(i = path2.length - 1; i >= 0; --i){
            if (path2.charCodeAt(i) === 47) {
                if (!matchedSlash) {
                    start = i + 1;
                    break;
                }
            } else if (end === -1) {
                matchedSlash = false;
                end = i + 1;
            }
        }
        if (end === -1) return "";
        return path2.slice(start, end);
    }
}
function extname4(path2) {
    assertPath1(path2);
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let preDotState = 0;
    for(let i = path2.length - 1; i >= 0; --i){
        const code = path2.charCodeAt(i);
        if (code === 47) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        return "";
    }
    return path2.slice(startDot, end);
}
function format6(pathObject) {
    if (pathObject === null || typeof pathObject !== "object") {
        throw new TypeError(`The "pathObject" argument must be of type Object. Received type ${typeof pathObject}`);
    }
    return _format1("/", pathObject);
}
function parse4(path2) {
    assertPath1(path2);
    const ret = {
        root: "",
        dir: "",
        base: "",
        ext: "",
        name: ""
    };
    if (path2.length === 0) return ret;
    const isAbsolute5 = path2.charCodeAt(0) === 47;
    let start;
    if (isAbsolute5) {
        ret.root = "/";
        start = 1;
    } else {
        start = 0;
    }
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let i = path2.length - 1;
    let preDotState = 0;
    for(; i >= start; --i){
        const code = path2.charCodeAt(i);
        if (code === 47) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        if (end !== -1) {
            if (startPart === 0 && isAbsolute5) {
                ret.base = ret.name = path2.slice(1, end);
            } else {
                ret.base = ret.name = path2.slice(startPart, end);
            }
        }
    } else {
        if (startPart === 0 && isAbsolute5) {
            ret.name = path2.slice(1, startDot);
            ret.base = path2.slice(1, end);
        } else {
            ret.name = path2.slice(startPart, startDot);
            ret.base = path2.slice(startPart, end);
        }
        ret.ext = path2.slice(startDot, end);
    }
    if (startPart > 0) ret.dir = path2.slice(0, startPart - 1);
    else if (isAbsolute5) ret.dir = "/";
    return ret;
}
function fromFileUrl4(url) {
    url = url instanceof URL ? url : new URL(url);
    if (url.protocol != "file:") {
        throw new TypeError("Must be a file URL.");
    }
    return decodeURIComponent(url.pathname.replace(/%(?![0-9A-Fa-f]{2})/g, "%25"));
}
function toFileUrl4(path2) {
    if (!isAbsolute4(path2)) {
        throw new TypeError("Must be an absolute path.");
    }
    const url = new URL("file:///");
    url.pathname = encodeWhitespace1(path2.replace(/%/g, "%25").replace(/\\/g, "%5C"));
    return url;
}
const mod6 = function() {
    return {
        sep: sep4,
        delimiter: delimiter4,
        resolve: resolve4,
        normalize: normalize5,
        isAbsolute: isAbsolute4,
        join: join5,
        relative: relative4,
        toNamespacedPath: toNamespacedPath4,
        dirname: dirname4,
        basename: basename4,
        extname: extname4,
        format: format6,
        parse: parse4,
        fromFileUrl: fromFileUrl4,
        toFileUrl: toFileUrl4
    };
}();
const path2 = isWindows1 ? mod5 : mod6;
const regExpEscapeChars1 = [
    "!",
    "$",
    "(",
    ")",
    "*",
    "+",
    ".",
    "=",
    "?",
    "[",
    "\\",
    "^",
    "{",
    "|"
];
const SEP1 = isWindows1 ? "\\" : "/";
function common1(paths, sep5 = SEP1) {
    const [first = "", ...remaining] = paths;
    if (first === "" || remaining.length === 0) {
        return first.substring(0, first.lastIndexOf(sep5) + 1);
    }
    const parts = first.split(sep5);
    let endOfPrefix = parts.length;
    for (const path3 of remaining){
        const compare = path3.split(sep5);
        for(let i = 0; i < endOfPrefix; i++){
            if (compare[i] !== parts[i]) {
                endOfPrefix = i;
            }
        }
        if (endOfPrefix === 0) {
            return "";
        }
    }
    const prefix = parts.slice(0, endOfPrefix).join(sep5);
    return prefix.endsWith(sep5) ? prefix : `${prefix}${sep5}`;
}
const { basename: basename5 , delimiter: delimiter5 , dirname: dirname5 , extname: extname5 , format: format7 , fromFileUrl: fromFileUrl5 , isAbsolute: isAbsolute5 , join: join6 , normalize: normalize6 , parse: parse5 , relative: relative5 , resolve: resolve5 , sep: sep5 , toFileUrl: toFileUrl5 , toNamespacedPath: toNamespacedPath5 ,  } = path2;
const SEP_PATTERN1 = isWindows1 ? /[\\/]+/ : /\/+/;
const rangeEscapeChars1 = [
    "-",
    "\\",
    "]"
];
function globToRegExp1(glob, { extended =true , globstar: globstarOption = true , os =osType1  } = {
}) {
    if (glob == "") {
        return /(?!)/;
    }
    const sep6 = os == "windows" ? "(?:\\\\|/)+" : "/+";
    const sepMaybe = os == "windows" ? "(?:\\\\|/)*" : "/*";
    const seps = os == "windows" ? [
        "\\",
        "/"
    ] : [
        "/"
    ];
    const globstar = os == "windows" ? "(?:[^\\\\/]*(?:\\\\|/|$)+)*" : "(?:[^/]*(?:/|$)+)*";
    const wildcard = os == "windows" ? "[^\\\\/]*" : "[^/]*";
    const escapePrefix = os == "windows" ? "`" : "\\";
    let newLength = glob.length;
    for(; newLength > 1 && seps.includes(glob[newLength - 1]); newLength--);
    glob = glob.slice(0, newLength);
    let regExpString = "";
    for(let j = 0; j < glob.length;){
        let segment = "";
        const groupStack = [];
        let inRange = false;
        let inEscape = false;
        let endsWithSep = false;
        let i = j;
        for(; i < glob.length && !seps.includes(glob[i]); i++){
            if (inEscape) {
                inEscape = false;
                const escapeChars = inRange ? rangeEscapeChars1 : regExpEscapeChars1;
                segment += escapeChars.includes(glob[i]) ? `\\${glob[i]}` : glob[i];
                continue;
            }
            if (glob[i] == escapePrefix) {
                inEscape = true;
                continue;
            }
            if (glob[i] == "[") {
                if (!inRange) {
                    inRange = true;
                    segment += "[";
                    if (glob[i + 1] == "!") {
                        i++;
                        segment += "^";
                    } else if (glob[i + 1] == "^") {
                        i++;
                        segment += "\\^";
                    }
                    continue;
                } else if (glob[i + 1] == ":") {
                    let k = i + 1;
                    let value = "";
                    while(glob[k + 1] != null && glob[k + 1] != ":"){
                        value += glob[k + 1];
                        k++;
                    }
                    if (glob[k + 1] == ":" && glob[k + 2] == "]") {
                        i = k + 2;
                        if (value == "alnum") segment += "\\dA-Za-z";
                        else if (value == "alpha") segment += "A-Za-z";
                        else if (value == "ascii") segment += "\x00-\x7F";
                        else if (value == "blank") segment += "\t ";
                        else if (value == "cntrl") segment += "\x00-\x1F\x7F";
                        else if (value == "digit") segment += "\\d";
                        else if (value == "graph") segment += "\x21-\x7E";
                        else if (value == "lower") segment += "a-z";
                        else if (value == "print") segment += "\x20-\x7E";
                        else if (value == "punct") {
                            segment += "!\"#$%&'()*+,\\-./:;<=>?@[\\\\\\]^_‘{|}~";
                        } else if (value == "space") segment += "\\s\v";
                        else if (value == "upper") segment += "A-Z";
                        else if (value == "word") segment += "\\w";
                        else if (value == "xdigit") segment += "\\dA-Fa-f";
                        continue;
                    }
                }
            }
            if (glob[i] == "]" && inRange) {
                inRange = false;
                segment += "]";
                continue;
            }
            if (inRange) {
                if (glob[i] == "\\") {
                    segment += `\\\\`;
                } else {
                    segment += glob[i];
                }
                continue;
            }
            if (glob[i] == ")" && groupStack.length > 0 && groupStack[groupStack.length - 1] != "BRACE") {
                segment += ")";
                const type = groupStack.pop();
                if (type == "!") {
                    segment += wildcard;
                } else if (type != "@") {
                    segment += type;
                }
                continue;
            }
            if (glob[i] == "|" && groupStack.length > 0 && groupStack[groupStack.length - 1] != "BRACE") {
                segment += "|";
                continue;
            }
            if (glob[i] == "+" && extended && glob[i + 1] == "(") {
                i++;
                groupStack.push("+");
                segment += "(?:";
                continue;
            }
            if (glob[i] == "@" && extended && glob[i + 1] == "(") {
                i++;
                groupStack.push("@");
                segment += "(?:";
                continue;
            }
            if (glob[i] == "?") {
                if (extended && glob[i + 1] == "(") {
                    i++;
                    groupStack.push("?");
                    segment += "(?:";
                } else {
                    segment += ".";
                }
                continue;
            }
            if (glob[i] == "!" && extended && glob[i + 1] == "(") {
                i++;
                groupStack.push("!");
                segment += "(?!";
                continue;
            }
            if (glob[i] == "{") {
                groupStack.push("BRACE");
                segment += "(?:";
                continue;
            }
            if (glob[i] == "}" && groupStack[groupStack.length - 1] == "BRACE") {
                groupStack.pop();
                segment += ")";
                continue;
            }
            if (glob[i] == "," && groupStack[groupStack.length - 1] == "BRACE") {
                segment += "|";
                continue;
            }
            if (glob[i] == "*") {
                if (extended && glob[i + 1] == "(") {
                    i++;
                    groupStack.push("*");
                    segment += "(?:";
                } else {
                    const prevChar = glob[i - 1];
                    let numStars = 1;
                    while(glob[i + 1] == "*"){
                        i++;
                        numStars++;
                    }
                    const nextChar = glob[i + 1];
                    if (globstarOption && numStars == 2 && [
                        ...seps,
                        undefined
                    ].includes(prevChar) && [
                        ...seps,
                        undefined
                    ].includes(nextChar)) {
                        segment += globstar;
                        endsWithSep = true;
                    } else {
                        segment += wildcard;
                    }
                }
                continue;
            }
            segment += regExpEscapeChars1.includes(glob[i]) ? `\\${glob[i]}` : glob[i];
        }
        if (groupStack.length > 0 || inRange || inEscape) {
            segment = "";
            for (const c of glob.slice(j, i)){
                segment += regExpEscapeChars1.includes(c) ? `\\${c}` : c;
                endsWithSep = false;
            }
        }
        regExpString += segment;
        if (!endsWithSep) {
            regExpString += i < glob.length ? sep6 : sepMaybe;
            endsWithSep = true;
        }
        while(seps.includes(glob[i]))i++;
        if (!(i > j)) {
            throw new Error("Assertion failure: i > j (potential infinite loop)");
        }
        j = i;
    }
    regExpString = `^${regExpString}$`;
    return new RegExp(regExpString);
}
function isGlob1(str) {
    const chars = {
        "{": "}",
        "(": ")",
        "[": "]"
    };
    const regex = /\\(.)|(^!|\*|[\].+)]\?|\[[^\\\]]+\]|\{[^\\}]+\}|\(\?[:!=][^\\)]+\)|\([^|]+\|[^\\)]+\))/;
    if (str === "") {
        return false;
    }
    let match;
    while(match = regex.exec(str)){
        if (match[2]) return true;
        let idx = match.index + match[0].length;
        const open = match[1];
        const close = open ? chars[open] : null;
        if (open && close) {
            const n = str.indexOf(close, idx);
            if (n !== -1) {
                idx = n + 1;
            }
        }
        str = str.slice(idx);
    }
    return false;
}
function normalizeGlob1(glob, { globstar =false  } = {
}) {
    if (glob.match(/\0/g)) {
        throw new Error(`Glob contains invalid characters: "${glob}"`);
    }
    if (!globstar) {
        return normalize6(glob);
    }
    const s = SEP_PATTERN1.source;
    const badParentPattern = new RegExp(`(?<=(${s}|^)\\*\\*${s})\\.\\.(?=${s}|$)`, "g");
    return normalize6(glob.replace(badParentPattern, "\0")).replace(/\0/g, "..");
}
function joinGlobs1(globs, { extended =false , globstar =false  } = {
}) {
    if (!globstar || globs.length == 0) {
        return join6(...globs);
    }
    if (globs.length === 0) return ".";
    let joined;
    for (const glob of globs){
        const path3 = glob;
        if (path3.length > 0) {
            if (!joined) joined = path3;
            else joined += `${SEP1}${path3}`;
        }
    }
    if (!joined) return ".";
    return normalizeGlob1(joined, {
        extended,
        globstar
    });
}
const mod7 = function() {
    return {
        SEP: SEP1,
        SEP_PATTERN: SEP_PATTERN1,
        win32: mod5,
        posix: mod6,
        basename: basename5,
        delimiter: delimiter5,
        dirname: dirname5,
        extname: extname5,
        format: format7,
        fromFileUrl: fromFileUrl5,
        isAbsolute: isAbsolute5,
        join: join6,
        normalize: normalize6,
        parse: parse5,
        relative: relative5,
        resolve: resolve5,
        sep: sep5,
        toFileUrl: toFileUrl5,
        toNamespacedPath: toNamespacedPath5,
        common: common1,
        globToRegExp: globToRegExp1,
        isGlob: isGlob1,
        normalizeGlob: normalizeGlob1,
        joinGlobs: joinGlobs1
    };
}();
var EOL1;
(function(EOL2) {
    EOL2["LF"] = "\n";
    EOL2["CRLF"] = "\r\n";
})(EOL1 || (EOL1 = {
}));
function deferred() {
    let methods;
    const promise = new Promise((resolve6, reject)=>{
        methods = {
            resolve: resolve6,
            reject
        };
    });
    return Object.assign(promise, methods);
}
class Lock {
    #waiters;
    constructor(){
        this.#waiters = [];
    }
    async with(callback) {
        await this.acquire();
        try {
            await callback() ?? Promise.resolve();
        } finally{
            this.release();
        }
    }
    async acquire() {
        const waiters = [
            ...this.#waiters
        ];
        this.#waiters.push(deferred());
        if (waiters.length) {
            await Promise.all(waiters);
        }
        return true;
    }
    release() {
        const waiter = this.#waiters.shift();
        if (waiter) {
            waiter.resolve();
        } else {
            throw new Error("The lock is not locked");
        }
    }
    locked() {
        return !!this.#waiters.length;
    }
}
class Event1 {
    #waiter;
    constructor(){
        this.#waiter = deferred();
    }
    async wait() {
        if (this.#waiter) {
            await this.#waiter;
        }
        return true;
    }
    set() {
        if (this.#waiter) {
            this.#waiter.resolve();
            this.#waiter = null;
        }
    }
    clear() {
        if (!this.#waiter) {
            this.#waiter = deferred();
        }
    }
    is_set() {
        return !this.#waiter;
    }
}
class Condition {
    #lock;
    #waiters;
    constructor(lock){
        this.#lock = lock ?? new Lock();
        this.#waiters = [];
    }
    async with(callback) {
        await this.acquire();
        try {
            await callback() ?? Promise.resolve();
        } finally{
            this.release();
        }
    }
    async acquire() {
        await this.#lock.acquire();
        return true;
    }
    release() {
        this.#lock.release();
    }
    locked() {
        return this.#lock.locked();
    }
    notify(n = 1) {
        if (!this.locked()) {
            throw new Error("The lock is not acquired");
        }
        for (const i of Array(n)){
            const waiter = this.#waiters.shift();
            if (!waiter) {
                break;
            }
            waiter.set();
        }
    }
    notify_all() {
        this.notify(this.#waiters.length);
    }
    async wait() {
        if (!this.locked()) {
            throw new Error("The lock is not acquired");
        }
        const event = new Event1();
        this.#waiters.push(event);
        this.release();
        await event.wait();
        await this.acquire();
        return true;
    }
    async wait_for(predicate) {
        while(!predicate()){
            await this.wait();
        }
    }
}
class QueueEmpty extends Error {
}
class QueueFull extends Error {
}
class Queue {
    #queue;
    #maxsize;
    #full_notifier;
    #empty_notifier;
    constructor(maxsize = 0){
        this.#queue = [];
        this.#maxsize = maxsize <= 0 ? 0 : maxsize;
        this.#full_notifier = new Condition();
        this.#empty_notifier = new Condition();
    }
    empty() {
        return !this.#queue.length;
    }
    full() {
        return !!this.#maxsize && this.#queue.length === this.#maxsize;
    }
    async get() {
        const value = this.#queue.shift();
        if (!value) {
            return new Promise((resolve6)=>{
                this.#empty_notifier.with(async ()=>{
                    await this.#empty_notifier.wait_for(()=>!!this.#queue.length
                    );
                    resolve6(await this.get());
                });
            });
        }
        await this.#full_notifier.with(()=>{
            this.#full_notifier.notify();
        });
        return value;
    }
    get_nowait() {
        const value = this.#queue.shift();
        if (!value) {
            throw new QueueEmpty("Queue empty");
        }
        this.#full_notifier.with(()=>{
            this.#full_notifier.notify();
        });
        return value;
    }
    async put(value) {
        if (this.#maxsize && this.#queue.length >= this.#maxsize) {
            await this.#full_notifier.with(async ()=>{
                await this.#full_notifier.wait_for(()=>this.#queue.length < this.#maxsize
                );
                await this.put(value);
            });
            return;
        }
        await this.#empty_notifier.with(()=>{
            this.#empty_notifier.notify();
        });
        this.#queue.push(value);
    }
    put_nowait(value) {
        if (this.#maxsize && this.#queue.length >= this.#maxsize) {
            throw new QueueFull("Queue full");
        }
        this.#empty_notifier.with(()=>{
            this.#empty_notifier.notify();
        });
        this.#queue.push(value);
    }
    qsize() {
        return this.#queue.length;
    }
}
class Semaphore {
    value;
    #lock;
    constructor(value2 = 1){
        if (value2 < 0) {
            throw new Error("The value must be greater than 0");
        }
        this.#lock = new Lock();
        this.value = value2;
    }
    async with(callback) {
        await this.acquire();
        try {
            await callback() ?? Promise.resolve();
        } finally{
            this.release();
        }
    }
    async acquire() {
        if (this.value > 0) {
            this.value -= 1;
        }
        if (this.value === 0) {
            await this.#lock.acquire();
        }
        return true;
    }
    release() {
        if (this.#lock.locked()) {
            this.#lock.release();
        }
        if (!this.#lock.locked()) {
            this.value += 1;
        }
    }
    locked() {
        return this.value === 0;
    }
}
class BoundedSemaphore extends Semaphore {
    #bound;
    constructor(value1 = 1){
        super(value1);
        this.#bound = value1;
    }
    release() {
        if (this.value === this.#bound) {
            throw new Error("release() cannot be called more than acquire() with BoundedSemaphore");
        }
        super.release();
    }
}
function utf8Count(str) {
    const strLength = str.length;
    let byteLength = 0;
    let pos = 0;
    while(pos < strLength){
        let value2 = str.charCodeAt(pos++);
        if ((value2 & 4294967168) === 0) {
            byteLength++;
            continue;
        } else if ((value2 & 4294965248) === 0) {
            byteLength += 2;
        } else {
            if (value2 >= 55296 && value2 <= 56319) {
                if (pos < strLength) {
                    const extra = str.charCodeAt(pos);
                    if ((extra & 64512) === 56320) {
                        ++pos;
                        value2 = ((value2 & 1023) << 10) + (extra & 1023) + 65536;
                    }
                }
            }
            if ((value2 & 4294901760) === 0) {
                byteLength += 3;
            } else {
                byteLength += 4;
            }
        }
    }
    return byteLength;
}
function utf8EncodeJs(str, output, outputOffset) {
    const strLength = str.length;
    let offset = outputOffset;
    let pos = 0;
    while(pos < strLength){
        let value2 = str.charCodeAt(pos++);
        if ((value2 & 4294967168) === 0) {
            output[offset++] = value2;
            continue;
        } else if ((value2 & 4294965248) === 0) {
            output[offset++] = value2 >> 6 & 31 | 192;
        } else {
            if (value2 >= 55296 && value2 <= 56319) {
                if (pos < strLength) {
                    const extra = str.charCodeAt(pos);
                    if ((extra & 64512) === 56320) {
                        ++pos;
                        value2 = ((value2 & 1023) << 10) + (extra & 1023) + 65536;
                    }
                }
            }
            if ((value2 & 4294901760) === 0) {
                output[offset++] = value2 >> 12 & 15 | 224;
                output[offset++] = value2 >> 6 & 63 | 128;
            } else {
                output[offset++] = value2 >> 18 & 7 | 240;
                output[offset++] = value2 >> 12 & 63 | 128;
                output[offset++] = value2 >> 6 & 63 | 128;
            }
        }
        output[offset++] = value2 & 63 | 128;
    }
}
const sharedTextEncoder = new TextEncoder();
function utf8EncodeTEencodeInto(str, output, outputOffset) {
    sharedTextEncoder.encodeInto(str, output.subarray(outputOffset));
}
const utf8EncodeTE = utf8EncodeTEencodeInto;
function utf8DecodeJs(bytes, inputOffset, byteLength) {
    let offset = inputOffset;
    const end = offset + byteLength;
    const units = [];
    let result = "";
    while(offset < end){
        const byte1 = bytes[offset++];
        if ((byte1 & 128) === 0) {
            units.push(byte1);
        } else if ((byte1 & 224) === 192) {
            const byte2 = bytes[offset++] & 63;
            units.push((byte1 & 31) << 6 | byte2);
        } else if ((byte1 & 240) === 224) {
            const byte2 = bytes[offset++] & 63;
            const byte3 = bytes[offset++] & 63;
            units.push((byte1 & 31) << 12 | byte2 << 6 | byte3);
        } else if ((byte1 & 248) === 240) {
            const byte2 = bytes[offset++] & 63;
            const byte3 = bytes[offset++] & 63;
            const byte4 = bytes[offset++] & 63;
            let unit = (byte1 & 7) << 18 | byte2 << 12 | byte3 << 6 | byte4;
            if (unit > 65535) {
                unit -= 65536;
                units.push(unit >>> 10 & 1023 | 55296);
                unit = 56320 | unit & 1023;
            }
            units.push(unit);
        } else {
            units.push(byte1);
        }
        if (units.length >= 4096) {
            result += String.fromCharCode(...units);
            units.length = 0;
        }
    }
    if (units.length > 0) {
        result += String.fromCharCode(...units);
    }
    return result;
}
const sharedTextDecoder = new TextDecoder();
function utf8DecodeTD(bytes, inputOffset, byteLength) {
    const stringBytes = bytes.subarray(inputOffset, inputOffset + byteLength);
    return sharedTextDecoder.decode(stringBytes);
}
class ExtData {
    type;
    data;
    constructor(type1, data1){
        this.type = type1;
        this.data = data1;
    }
}
function setUint64(view, offset, value2) {
    const high = value2 / 4294967296;
    const low = value2;
    view.setUint32(offset, high);
    view.setUint32(offset + 4, low);
}
function setInt64(view, offset, value2) {
    const high = Math.floor(value2 / 4294967296);
    const low = value2;
    view.setUint32(offset, high);
    view.setUint32(offset + 4, low);
}
function getInt64(view, offset) {
    const high = view.getInt32(offset);
    const low = view.getUint32(offset + 4);
    return high * 4294967296 + low;
}
function getUint64(view, offset) {
    const high = view.getUint32(offset);
    const low = view.getUint32(offset + 4);
    return high * 4294967296 + low;
}
const EXT_TIMESTAMP = -1;
const TIMESTAMP32_MAX_SEC = 4294967296 - 1;
const TIMESTAMP64_MAX_SEC = 17179869184 - 1;
function encodeTimeSpecToTimestamp({ sec , nsec  }) {
    if (sec >= 0 && nsec >= 0 && sec <= TIMESTAMP64_MAX_SEC) {
        if (nsec === 0 && sec <= TIMESTAMP32_MAX_SEC) {
            const rv = new Uint8Array(4);
            const view = new DataView(rv.buffer);
            view.setUint32(0, sec);
            return rv;
        } else {
            const secHigh = sec / 4294967296;
            const secLow = sec & 4294967295;
            const rv = new Uint8Array(8);
            const view = new DataView(rv.buffer);
            view.setUint32(0, nsec << 2 | secHigh & 3);
            view.setUint32(4, secLow);
            return rv;
        }
    } else {
        const rv = new Uint8Array(12);
        const view = new DataView(rv.buffer);
        view.setUint32(0, nsec);
        setInt64(view, 4, sec);
        return rv;
    }
}
function encodeDateToTimeSpec(date) {
    const msec = date.getTime();
    const sec = Math.floor(msec / 1000);
    const nsec = (msec - sec * 1000) * 1000000;
    const nsecInSec = Math.floor(nsec / 1000000000);
    return {
        sec: sec + nsecInSec,
        nsec: nsec - nsecInSec * 1000000000
    };
}
function encodeTimestampExtension(object) {
    if (object instanceof Date) {
        const timeSpec = encodeDateToTimeSpec(object);
        return encodeTimeSpecToTimestamp(timeSpec);
    } else {
        return null;
    }
}
function decodeTimestampToTimeSpec(data1) {
    const view = new DataView(data1.buffer, data1.byteOffset, data1.byteLength);
    switch(data1.byteLength){
        case 4:
            {
                const sec = view.getUint32(0);
                const nsec = 0;
                return {
                    sec,
                    nsec: 0
                };
            }
        case 8:
            {
                const nsec30AndSecHigh2 = view.getUint32(0);
                const secLow32 = view.getUint32(4);
                const sec = (nsec30AndSecHigh2 & 3) * 4294967296 + secLow32;
                const nsec = nsec30AndSecHigh2 >>> 2;
                return {
                    sec,
                    nsec
                };
            }
        case 12:
            {
                const sec = getInt64(view, 4);
                const nsec = view.getUint32(0);
                return {
                    sec,
                    nsec
                };
            }
        default:
            throw new Error(`Unrecognized data size for timestamp: ${data1.length}`);
    }
}
function decodeTimestampExtension(data1) {
    const timeSpec = decodeTimestampToTimeSpec(data1);
    return new Date(timeSpec.sec * 1000 + timeSpec.nsec / 1000000);
}
const timestampExtension = {
    type: EXT_TIMESTAMP,
    encode: encodeTimestampExtension,
    decode: decodeTimestampExtension
};
class ExtensionCodec {
    static defaultCodec = new ExtensionCodec();
    __brand;
    builtInEncoders = [];
    builtInDecoders = [];
    encoders = [];
    decoders = [];
    constructor(){
        this.register(timestampExtension);
    }
    register({ type , encode , decode  }) {
        if (type >= 0) {
            this.encoders[type] = encode;
            this.decoders[type] = decode;
        } else {
            const index = 1 + type;
            this.builtInEncoders[index] = encode;
            this.builtInDecoders[index] = decode;
        }
    }
    tryToEncode(object, context) {
        for(let i = 0; i < this.builtInEncoders.length; i++){
            const encoder = this.builtInEncoders[i];
            if (encoder != null) {
                const data1 = encoder(object, context);
                if (data1 != null) {
                    const type2 = -1 - i;
                    return new ExtData(type2, data1);
                }
            }
        }
        for(let i1 = 0; i1 < this.encoders.length; i1++){
            const encoder = this.encoders[i1];
            if (encoder != null) {
                const data1 = encoder(object, context);
                if (data1 != null) {
                    const type2 = i1;
                    return new ExtData(type2, data1);
                }
            }
        }
        if (object instanceof ExtData) {
            return object;
        }
        return null;
    }
    decode(data, type, context) {
        const decoder = type < 0 ? this.builtInDecoders[-1 - type] : this.decoders[type];
        if (decoder) {
            return decoder(data, type, context);
        } else {
            return new ExtData(type, data);
        }
    }
}
function ensureUint8Array(buffer) {
    if (buffer instanceof Uint8Array) {
        return buffer;
    } else if (ArrayBuffer.isView(buffer)) {
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } else if (buffer instanceof ArrayBuffer) {
        return new Uint8Array(buffer);
    } else {
        return Uint8Array.from(buffer);
    }
}
function createDataView(buffer) {
    if (buffer instanceof ArrayBuffer) {
        return new DataView(buffer);
    }
    const bufferView = ensureUint8Array(buffer);
    return new DataView(bufferView.buffer, bufferView.byteOffset, bufferView.byteLength);
}
class Encoder {
    extensionCodec;
    context;
    maxDepth;
    initialBufferSize;
    sortKeys;
    forceFloat32;
    ignoreUndefined;
    pos = 0;
    view;
    bytes;
    constructor(extensionCodec1 = ExtensionCodec.defaultCodec, context1 = undefined, maxDepth = 100, initialBufferSize = 2048, sortKeys = false, forceFloat32 = false, ignoreUndefined = false){
        this.extensionCodec = extensionCodec1;
        this.context = context1;
        this.maxDepth = maxDepth;
        this.initialBufferSize = initialBufferSize;
        this.sortKeys = sortKeys;
        this.forceFloat32 = forceFloat32;
        this.ignoreUndefined = ignoreUndefined;
        this.view = new DataView(new ArrayBuffer(this.initialBufferSize));
        this.bytes = new Uint8Array(this.view.buffer);
    }
    getUint8Array() {
        return this.bytes.subarray(0, this.pos);
    }
    reinitializeState() {
        this.pos = 0;
    }
    encode(object) {
        this.reinitializeState();
        this.doEncode(object, 1);
        return this.getUint8Array();
    }
    doEncode(object, depth) {
        if (depth > this.maxDepth) {
            throw new Error(`Too deep objects in depth ${depth}`);
        }
        if (object == null) {
            this.encodeNil();
        } else if (typeof object === "boolean") {
            this.encodeBoolean(object);
        } else if (typeof object === "number") {
            this.encodeNumber(object);
        } else if (typeof object === "string") {
            this.encodeString(object);
        } else {
            this.encodeObject(object, depth);
        }
    }
    ensureBufferSizeToWrite(sizeToWrite) {
        const requiredSize = this.pos + sizeToWrite;
        if (this.view.byteLength < requiredSize) {
            this.resizeBuffer(requiredSize * 2);
        }
    }
    resizeBuffer(newSize) {
        const newBuffer = new ArrayBuffer(newSize);
        const newBytes = new Uint8Array(newBuffer);
        const newView = new DataView(newBuffer);
        newBytes.set(this.bytes);
        this.view = newView;
        this.bytes = newBytes;
    }
    encodeNil() {
        this.writeU8(192);
    }
    encodeBoolean(object) {
        if (object === false) {
            this.writeU8(194);
        } else {
            this.writeU8(195);
        }
    }
    encodeNumber(object) {
        if (Number.isSafeInteger(object)) {
            if (object >= 0) {
                if (object < 128) {
                    this.writeU8(object);
                } else if (object < 256) {
                    this.writeU8(204);
                    this.writeU8(object);
                } else if (object < 65536) {
                    this.writeU8(205);
                    this.writeU16(object);
                } else if (object < 4294967296) {
                    this.writeU8(206);
                    this.writeU32(object);
                } else {
                    this.writeU8(207);
                    this.writeU64(object);
                }
            } else {
                if (object >= -32) {
                    this.writeU8(224 | object + 32);
                } else if (object >= -128) {
                    this.writeU8(208);
                    this.writeI8(object);
                } else if (object >= -32768) {
                    this.writeU8(209);
                    this.writeI16(object);
                } else if (object >= -2147483648) {
                    this.writeU8(210);
                    this.writeI32(object);
                } else {
                    this.writeU8(211);
                    this.writeI64(object);
                }
            }
        } else {
            if (this.forceFloat32) {
                this.writeU8(202);
                this.writeF32(object);
            } else {
                this.writeU8(203);
                this.writeF64(object);
            }
        }
    }
    writeStringHeader(byteLength) {
        if (byteLength < 32) {
            this.writeU8(160 + byteLength);
        } else if (byteLength < 256) {
            this.writeU8(217);
            this.writeU8(byteLength);
        } else if (byteLength < 65536) {
            this.writeU8(218);
            this.writeU16(byteLength);
        } else if (byteLength < 4294967296) {
            this.writeU8(219);
            this.writeU32(byteLength);
        } else {
            throw new Error(`Too long string: ${byteLength} bytes in UTF-8`);
        }
    }
    encodeString(object) {
        const maxHeaderSize = 1 + 4;
        const strLength = object.length;
        if (strLength > 200) {
            const byteLength = utf8Count(object);
            this.ensureBufferSizeToWrite(maxHeaderSize + byteLength);
            this.writeStringHeader(byteLength);
            utf8EncodeTE(object, this.bytes, this.pos);
            this.pos += byteLength;
        } else {
            const byteLength = utf8Count(object);
            this.ensureBufferSizeToWrite(maxHeaderSize + byteLength);
            this.writeStringHeader(byteLength);
            utf8EncodeJs(object, this.bytes, this.pos);
            this.pos += byteLength;
        }
    }
    encodeObject(object, depth) {
        const ext = this.extensionCodec.tryToEncode(object, this.context);
        if (ext != null) {
            this.encodeExtension(ext);
        } else if (Array.isArray(object)) {
            this.encodeArray(object, depth);
        } else if (ArrayBuffer.isView(object)) {
            this.encodeBinary(object);
        } else if (typeof object === "object") {
            this.encodeMap(object, depth);
        } else {
            throw new Error(`Unrecognized object: ${Object.prototype.toString.apply(object)}`);
        }
    }
    encodeBinary(object) {
        const size = object.byteLength;
        if (size < 256) {
            this.writeU8(196);
            this.writeU8(size);
        } else if (size < 65536) {
            this.writeU8(197);
            this.writeU16(size);
        } else if (size < 4294967296) {
            this.writeU8(198);
            this.writeU32(size);
        } else {
            throw new Error(`Too large binary: ${size}`);
        }
        const bytes = ensureUint8Array(object);
        this.writeU8a(bytes);
    }
    encodeArray(object, depth) {
        const size = object.length;
        if (size < 16) {
            this.writeU8(144 + size);
        } else if (size < 65536) {
            this.writeU8(220);
            this.writeU16(size);
        } else if (size < 4294967296) {
            this.writeU8(221);
            this.writeU32(size);
        } else {
            throw new Error(`Too large array: ${size}`);
        }
        for (const item of object){
            this.doEncode(item, depth + 1);
        }
    }
    countWithoutUndefined(object, keys) {
        let count = 0;
        for (const key of keys){
            if (object[key] !== undefined) {
                count++;
            }
        }
        return count;
    }
    encodeMap(object, depth) {
        const keys = Object.keys(object);
        if (this.sortKeys) {
            keys.sort();
        }
        const size = this.ignoreUndefined ? this.countWithoutUndefined(object, keys) : keys.length;
        if (size < 16) {
            this.writeU8(128 + size);
        } else if (size < 65536) {
            this.writeU8(222);
            this.writeU16(size);
        } else if (size < 4294967296) {
            this.writeU8(223);
            this.writeU32(size);
        } else {
            throw new Error(`Too large map object: ${size}`);
        }
        for (const key of keys){
            const value2 = object[key];
            if (!(this.ignoreUndefined && value2 === undefined)) {
                this.encodeString(key);
                this.doEncode(value2, depth + 1);
            }
        }
    }
    encodeExtension(ext) {
        const size = ext.data.length;
        if (size === 1) {
            this.writeU8(212);
        } else if (size === 2) {
            this.writeU8(213);
        } else if (size === 4) {
            this.writeU8(214);
        } else if (size === 8) {
            this.writeU8(215);
        } else if (size === 16) {
            this.writeU8(216);
        } else if (size < 256) {
            this.writeU8(199);
            this.writeU8(size);
        } else if (size < 65536) {
            this.writeU8(200);
            this.writeU16(size);
        } else if (size < 4294967296) {
            this.writeU8(201);
            this.writeU32(size);
        } else {
            throw new Error(`Too large extension object: ${size}`);
        }
        this.writeI8(ext.type);
        this.writeU8a(ext.data);
    }
    writeU8(value) {
        this.ensureBufferSizeToWrite(1);
        this.view.setUint8(this.pos, value);
        this.pos++;
    }
    writeU8a(values) {
        const size = values.length;
        this.ensureBufferSizeToWrite(size);
        this.bytes.set(values, this.pos);
        this.pos += size;
    }
    writeI8(value) {
        this.ensureBufferSizeToWrite(1);
        this.view.setInt8(this.pos, value);
        this.pos++;
    }
    writeU16(value) {
        this.ensureBufferSizeToWrite(2);
        this.view.setUint16(this.pos, value);
        this.pos += 2;
    }
    writeI16(value) {
        this.ensureBufferSizeToWrite(2);
        this.view.setInt16(this.pos, value);
        this.pos += 2;
    }
    writeU32(value) {
        this.ensureBufferSizeToWrite(4);
        this.view.setUint32(this.pos, value);
        this.pos += 4;
    }
    writeI32(value) {
        this.ensureBufferSizeToWrite(4);
        this.view.setInt32(this.pos, value);
        this.pos += 4;
    }
    writeF32(value) {
        this.ensureBufferSizeToWrite(4);
        this.view.setFloat32(this.pos, value);
        this.pos += 4;
    }
    writeF64(value) {
        this.ensureBufferSizeToWrite(8);
        this.view.setFloat64(this.pos, value);
        this.pos += 8;
    }
    writeU64(value) {
        this.ensureBufferSizeToWrite(8);
        setUint64(this.view, this.pos, value);
        this.pos += 8;
    }
    writeI64(value) {
        this.ensureBufferSizeToWrite(8);
        setInt64(this.view, this.pos, value);
        this.pos += 8;
    }
}
const defaultEncodeOptions = {
};
function encode3(value3, options = defaultEncodeOptions) {
    const encoder = new Encoder(options.extensionCodec, options.context, options.maxDepth, options.initialBufferSize, options.sortKeys, options.forceFloat32, options.ignoreUndefined);
    return encoder.encode(value3);
}
function prettyByte(__byte) {
    return `${__byte < 0 ? "-" : ""}0x${Math.abs(__byte).toString(16).padStart(2, "0")}`;
}
class CachedKeyDecoder {
    maxKeyLength;
    maxLengthPerKey;
    hit = 0;
    miss = 0;
    caches;
    constructor(maxKeyLength = 16, maxLengthPerKey = 16){
        this.maxKeyLength = maxKeyLength;
        this.maxLengthPerKey = maxLengthPerKey;
        this.caches = [];
        for(let i = 0; i < this.maxKeyLength; i++){
            this.caches.push([]);
        }
    }
    canBeCached(byteLength) {
        return byteLength > 0 && byteLength <= this.maxKeyLength;
    }
    get(bytes, inputOffset, byteLength) {
        const records = this.caches[byteLength - 1];
        const recordsLength = records.length;
        FIND_CHUNK: for(let i1 = 0; i1 < recordsLength; i1++){
            const record = records[i1];
            const recordBytes = record.bytes;
            for(let j = 0; j < byteLength; j++){
                if (recordBytes[j] !== bytes[inputOffset + j]) {
                    continue FIND_CHUNK;
                }
            }
            return record.value;
        }
        return null;
    }
    store(bytes, value) {
        const records = this.caches[bytes.length - 1];
        const record = {
            bytes,
            value
        };
        if (records.length >= this.maxLengthPerKey) {
            records[Math.random() * records.length | 0] = record;
        } else {
            records.push(record);
        }
    }
    decode(bytes, inputOffset, byteLength) {
        const cachedValue = this.get(bytes, inputOffset, byteLength);
        if (cachedValue != null) {
            this.hit++;
            return cachedValue;
        }
        this.miss++;
        const value3 = utf8DecodeJs(bytes, inputOffset, byteLength);
        const slicedCopyOfBytes = Uint8Array.prototype.slice.call(bytes, inputOffset, inputOffset + byteLength);
        this.store(slicedCopyOfBytes, value3);
        return value3;
    }
}
var State;
(function(State1) {
    State1[State1["ARRAY"] = 0] = "ARRAY";
    State1[State1["MAP_KEY"] = 1] = "MAP_KEY";
    State1[State1["MAP_VALUE"] = 2] = "MAP_VALUE";
})(State || (State = {
}));
const isValidMapKeyType = (key)=>{
    const keyType = typeof key;
    return keyType === "string" || keyType === "number";
};
const HEAD_BYTE_REQUIRED = -1;
const EMPTY_VIEW = new DataView(new ArrayBuffer(0));
const EMPTY_BYTES = new Uint8Array(EMPTY_VIEW.buffer);
const DataViewIndexOutOfBoundsError = (()=>{
    try {
        EMPTY_VIEW.getInt8(0);
    } catch (e) {
        return e.constructor;
    }
    throw new Error("never reached");
})();
const MORE_DATA = new DataViewIndexOutOfBoundsError("Insufficient data");
const sharedCachedKeyDecoder = new CachedKeyDecoder();
class Decoder {
    extensionCodec;
    context;
    maxStrLength;
    maxBinLength;
    maxArrayLength;
    maxMapLength;
    maxExtLength;
    keyDecoder;
    totalPos = 0;
    pos = 0;
    view = EMPTY_VIEW;
    bytes = EMPTY_BYTES;
    headByte = HEAD_BYTE_REQUIRED;
    stack = [];
    constructor(extensionCodec2 = ExtensionCodec.defaultCodec, context2 = undefined, maxStrLength = 4294967295, maxBinLength = 4294967295, maxArrayLength = 4294967295, maxMapLength = 4294967295, maxExtLength = 4294967295, keyDecoder = sharedCachedKeyDecoder){
        this.extensionCodec = extensionCodec2;
        this.context = context2;
        this.maxStrLength = maxStrLength;
        this.maxBinLength = maxBinLength;
        this.maxArrayLength = maxArrayLength;
        this.maxMapLength = maxMapLength;
        this.maxExtLength = maxExtLength;
        this.keyDecoder = keyDecoder;
    }
    reinitializeState() {
        this.totalPos = 0;
        this.headByte = HEAD_BYTE_REQUIRED;
    }
    setBuffer(buffer) {
        this.bytes = ensureUint8Array(buffer);
        this.view = createDataView(this.bytes);
        this.pos = 0;
    }
    appendBuffer(buffer) {
        buffer = ensureUint8Array(buffer).slice();
        if (this.headByte === HEAD_BYTE_REQUIRED && !this.hasRemaining()) {
            this.setBuffer(buffer);
        } else {
            const remainingData = this.bytes.subarray(this.pos);
            const newData = ensureUint8Array(buffer);
            const concated = new Uint8Array(remainingData.length + newData.length);
            concated.set(remainingData);
            concated.set(newData, remainingData.length);
            this.setBuffer(concated);
        }
    }
    hasRemaining(size = 1) {
        return this.view.byteLength - this.pos >= size;
    }
    createNoExtraBytesError(posToShow) {
        const { view , pos  } = this;
        return new RangeError(`Extra ${view.byteLength - pos} of ${view.byteLength} byte(s) found at buffer[${posToShow}]`);
    }
    decode(buffer) {
        this.reinitializeState();
        this.setBuffer(buffer);
        return this.doDecodeSingleSync();
    }
    doDecodeSingleSync() {
        const object = this.doDecodeSync();
        if (this.hasRemaining()) {
            throw this.createNoExtraBytesError(this.pos);
        }
        return object;
    }
    async decodeAsync(stream) {
        let decoded = false;
        let object;
        for await (const buffer of stream){
            if (decoded) {
                throw this.createNoExtraBytesError(this.totalPos);
            }
            this.appendBuffer(buffer);
            try {
                object = this.doDecodeSync();
                decoded = true;
            } catch (e) {
                if (!(e instanceof DataViewIndexOutOfBoundsError)) {
                    throw e;
                }
            }
            this.totalPos += this.pos;
        }
        if (decoded) {
            if (this.hasRemaining()) {
                throw this.createNoExtraBytesError(this.totalPos);
            }
            return object;
        }
        const { headByte , pos , totalPos  } = this;
        throw new RangeError(`Insufficient data in parcing ${prettyByte(headByte)} at ${totalPos} (${pos} in the current buffer)`);
    }
    decodeArrayStream(stream) {
        return this.decodeMultiAsync(stream, true);
    }
    decodeStream(stream) {
        return this.decodeMultiAsync(stream, false);
    }
    async *decodeMultiAsync(stream, isArray) {
        let isArrayHeaderRequired = isArray;
        let arrayItemsLeft = -1;
        for await (const buffer of stream){
            if (isArray && arrayItemsLeft === 0) {
                throw this.createNoExtraBytesError(this.totalPos);
            }
            this.appendBuffer(buffer);
            if (isArrayHeaderRequired) {
                arrayItemsLeft = this.readArraySize();
                isArrayHeaderRequired = false;
                this.complete();
            }
            try {
                while(true){
                    yield this.doDecodeSync();
                    if ((--arrayItemsLeft) === 0) {
                        break;
                    }
                }
            } catch (e) {
                if (!(e instanceof DataViewIndexOutOfBoundsError)) {
                    throw e;
                }
            }
            this.totalPos += this.pos;
        }
    }
    doDecodeSync() {
        DECODE: while(true){
            const headByte = this.readHeadByte();
            let object;
            if (headByte >= 224) {
                object = headByte - 256;
            } else if (headByte < 192) {
                if (headByte < 128) {
                    object = headByte;
                } else if (headByte < 144) {
                    const size = headByte - 128;
                    if (size !== 0) {
                        this.pushMapState(size);
                        this.complete();
                        continue DECODE;
                    } else {
                        object = {
                        };
                    }
                } else if (headByte < 160) {
                    const size = headByte - 144;
                    if (size !== 0) {
                        this.pushArrayState(size);
                        this.complete();
                        continue DECODE;
                    } else {
                        object = [];
                    }
                } else {
                    const byteLength = headByte - 160;
                    object = this.decodeUtf8String(byteLength, 0);
                }
            } else if (headByte === 192) {
                object = null;
            } else if (headByte === 194) {
                object = false;
            } else if (headByte === 195) {
                object = true;
            } else if (headByte === 202) {
                object = this.readF32();
            } else if (headByte === 203) {
                object = this.readF64();
            } else if (headByte === 204) {
                object = this.readU8();
            } else if (headByte === 205) {
                object = this.readU16();
            } else if (headByte === 206) {
                object = this.readU32();
            } else if (headByte === 207) {
                object = this.readU64();
            } else if (headByte === 208) {
                object = this.readI8();
            } else if (headByte === 209) {
                object = this.readI16();
            } else if (headByte === 210) {
                object = this.readI32();
            } else if (headByte === 211) {
                object = this.readI64();
            } else if (headByte === 217) {
                const byteLength = this.lookU8();
                object = this.decodeUtf8String(byteLength, 1);
            } else if (headByte === 218) {
                const byteLength = this.lookU16();
                object = this.decodeUtf8String(byteLength, 2);
            } else if (headByte === 219) {
                const byteLength = this.lookU32();
                object = this.decodeUtf8String(byteLength, 4);
            } else if (headByte === 220) {
                const size = this.readU16();
                if (size !== 0) {
                    this.pushArrayState(size);
                    this.complete();
                    continue DECODE;
                } else {
                    object = [];
                }
            } else if (headByte === 221) {
                const size = this.readU32();
                if (size !== 0) {
                    this.pushArrayState(size);
                    this.complete();
                    continue DECODE;
                } else {
                    object = [];
                }
            } else if (headByte === 222) {
                const size = this.readU16();
                if (size !== 0) {
                    this.pushMapState(size);
                    this.complete();
                    continue DECODE;
                } else {
                    object = {
                    };
                }
            } else if (headByte === 223) {
                const size = this.readU32();
                if (size !== 0) {
                    this.pushMapState(size);
                    this.complete();
                    continue DECODE;
                } else {
                    object = {
                    };
                }
            } else if (headByte === 196) {
                const size = this.lookU8();
                object = this.decodeBinary(size, 1);
            } else if (headByte === 197) {
                const size = this.lookU16();
                object = this.decodeBinary(size, 2);
            } else if (headByte === 198) {
                const size = this.lookU32();
                object = this.decodeBinary(size, 4);
            } else if (headByte === 212) {
                object = this.decodeExtension(1, 0);
            } else if (headByte === 213) {
                object = this.decodeExtension(2, 0);
            } else if (headByte === 214) {
                object = this.decodeExtension(4, 0);
            } else if (headByte === 215) {
                object = this.decodeExtension(8, 0);
            } else if (headByte === 216) {
                object = this.decodeExtension(16, 0);
            } else if (headByte === 199) {
                const size = this.lookU8();
                object = this.decodeExtension(size, 1);
            } else if (headByte === 200) {
                const size = this.lookU16();
                object = this.decodeExtension(size, 2);
            } else if (headByte === 201) {
                const size = this.lookU32();
                object = this.decodeExtension(size, 4);
            } else {
                throw new Error(`Unrecognized type byte: ${prettyByte(headByte)}`);
            }
            this.complete();
            const stack = this.stack;
            while(stack.length > 0){
                const state = stack[stack.length - 1];
                if (state.type === State.ARRAY) {
                    state.array[state.position] = object;
                    state.position++;
                    if (state.position === state.size) {
                        stack.pop();
                        object = state.array;
                    } else {
                        continue DECODE;
                    }
                } else if (state.type === State.MAP_KEY) {
                    if (!isValidMapKeyType(object)) {
                        throw new Error("The type of key must be string or number but " + typeof object);
                    }
                    state.key = object;
                    state.type = State.MAP_VALUE;
                    continue DECODE;
                } else {
                    state.map[state.key] = object;
                    state.readCount++;
                    if (state.readCount === state.size) {
                        stack.pop();
                        object = state.map;
                    } else {
                        state.key = null;
                        state.type = State.MAP_KEY;
                        continue DECODE;
                    }
                }
            }
            return object;
        }
    }
    readHeadByte() {
        if (this.headByte === HEAD_BYTE_REQUIRED) {
            this.headByte = this.readU8();
        }
        return this.headByte;
    }
    complete() {
        this.headByte = HEAD_BYTE_REQUIRED;
    }
    readArraySize() {
        const headByte = this.readHeadByte();
        switch(headByte){
            case 220:
                return this.readU16();
            case 221:
                return this.readU32();
            default:
                {
                    if (headByte < 160) {
                        return headByte - 144;
                    } else {
                        throw new Error(`Unrecognized array type byte: ${prettyByte(headByte)}`);
                    }
                }
        }
    }
    pushMapState(size) {
        if (size > this.maxMapLength) {
            throw new Error(`Max length exceeded: map length (${size}) > maxMapLengthLength (${this.maxMapLength})`);
        }
        this.stack.push({
            type: State.MAP_KEY,
            size,
            key: null,
            readCount: 0,
            map: {
            }
        });
    }
    pushArrayState(size) {
        if (size > this.maxArrayLength) {
            throw new Error(`Max length exceeded: array length (${size}) > maxArrayLength (${this.maxArrayLength})`);
        }
        this.stack.push({
            type: State.ARRAY,
            size,
            array: new Array(size),
            position: 0
        });
    }
    decodeUtf8String(byteLength, headerOffset) {
        if (byteLength > this.maxStrLength) {
            throw new Error(`Max length exceeded: UTF-8 byte length (${byteLength}) > maxStrLength (${this.maxStrLength})`);
        }
        if (this.bytes.byteLength < this.pos + headerOffset + byteLength) {
            throw MORE_DATA;
        }
        const offset = this.pos + headerOffset;
        let object;
        if (this.stateIsMapKey() && this.keyDecoder?.canBeCached(byteLength)) {
            object = this.keyDecoder.decode(this.bytes, offset, byteLength);
        } else if (byteLength > 200) {
            object = utf8DecodeTD(this.bytes, offset, byteLength);
        } else {
            object = utf8DecodeJs(this.bytes, offset, byteLength);
        }
        this.pos += headerOffset + byteLength;
        return object;
    }
    stateIsMapKey() {
        if (this.stack.length > 0) {
            const state = this.stack[this.stack.length - 1];
            return state.type === State.MAP_KEY;
        }
        return false;
    }
    decodeBinary(byteLength, headOffset) {
        if (byteLength > this.maxBinLength) {
            throw new Error(`Max length exceeded: bin length (${byteLength}) > maxBinLength (${this.maxBinLength})`);
        }
        if (!this.hasRemaining(byteLength + headOffset)) {
            throw MORE_DATA;
        }
        const offset = this.pos + headOffset;
        const object = this.bytes.subarray(offset, offset + byteLength);
        this.pos += headOffset + byteLength;
        return object;
    }
    decodeExtension(size, headOffset) {
        if (size > this.maxExtLength) {
            throw new Error(`Max length exceeded: ext length (${size}) > maxExtLength (${this.maxExtLength})`);
        }
        const extType = this.view.getInt8(this.pos + headOffset);
        const data2 = this.decodeBinary(size, headOffset + 1);
        return this.extensionCodec.decode(data2, extType, this.context);
    }
    lookU8() {
        return this.view.getUint8(this.pos);
    }
    lookU16() {
        return this.view.getUint16(this.pos);
    }
    lookU32() {
        return this.view.getUint32(this.pos);
    }
    readU8() {
        const value3 = this.view.getUint8(this.pos);
        this.pos++;
        return value3;
    }
    readI8() {
        const value3 = this.view.getInt8(this.pos);
        this.pos++;
        return value3;
    }
    readU16() {
        const value3 = this.view.getUint16(this.pos);
        this.pos += 2;
        return value3;
    }
    readI16() {
        const value3 = this.view.getInt16(this.pos);
        this.pos += 2;
        return value3;
    }
    readU32() {
        const value3 = this.view.getUint32(this.pos);
        this.pos += 4;
        return value3;
    }
    readI32() {
        const value3 = this.view.getInt32(this.pos);
        this.pos += 4;
        return value3;
    }
    readU64() {
        const value3 = getUint64(this.view, this.pos);
        this.pos += 8;
        return value3;
    }
    readI64() {
        const value3 = getInt64(this.view, this.pos);
        this.pos += 8;
        return value3;
    }
    readF32() {
        const value3 = this.view.getFloat32(this.pos);
        this.pos += 4;
        return value3;
    }
    readF64() {
        const value3 = this.view.getFloat64(this.pos);
        this.pos += 8;
        return value3;
    }
}
const defaultDecodeOptions = {
};
function isAsyncIterable(object) {
    return object[Symbol.asyncIterator] != null;
}
function assertNonNull(value3) {
    if (value3 == null) {
        throw new Error("Assertion Failure: value must not be null nor undefined");
    }
}
async function* asyncIterableFromStream(stream) {
    const reader = stream.getReader();
    try {
        while(true){
            const { done , value: value3  } = await reader.read();
            if (done) {
                return;
            }
            assertNonNull(value3);
            yield value3;
        }
    } finally{
        reader.releaseLock();
    }
}
function ensureAsyncIterabe(streamLike) {
    if (isAsyncIterable(streamLike)) {
        return streamLike;
    } else {
        return asyncIterableFromStream(streamLike);
    }
}
function decodeStream(streamLike, options = defaultDecodeOptions) {
    const stream = ensureAsyncIterabe(streamLike);
    const decoder = new Decoder(options.extensionCodec, options.context, options.maxStrLength, options.maxBinLength, options.maxArrayLength, options.maxMapLength, options.maxExtLength);
    return decoder.decodeStream(stream);
}
function deferred1() {
    let methods;
    const promise = new Promise((resolve6, reject)=>{
        methods = {
            resolve: resolve6,
            reject
        };
    });
    return Object.assign(promise, methods);
}
class DenoStdInternalError2 extends Error {
    constructor(message2){
        super(message2);
        this.name = "DenoStdInternalError";
    }
}
function assert2(expr, msg = "") {
    if (!expr) {
        throw new DenoStdInternalError2(msg);
    }
}
const MIN_READ = 32 * 1024;
const MAX_SIZE = 2 ** 32 - 2;
function copyBytes(src, dst, off = 0) {
    const r = dst.byteLength - off;
    if (src.byteLength > r) {
        src = src.subarray(0, r);
    }
    dst.set(src, off);
    return src.byteLength;
}
class Buffer {
    #buf;
    #off = 0;
    constructor(ab){
        if (ab === undefined) {
            this.#buf = new Uint8Array(0);
            return;
        }
        this.#buf = new Uint8Array(ab);
    }
    bytes(options = {
        copy: true
    }) {
        if (options.copy === false) return this.#buf.subarray(this.#off);
        return this.#buf.slice(this.#off);
    }
    empty() {
        return this.#buf.byteLength <= this.#off;
    }
    get length() {
        return this.#buf.byteLength - this.#off;
    }
    get capacity() {
        return this.#buf.buffer.byteLength;
    }
    truncate(n) {
        if (n === 0) {
            this.reset();
            return;
        }
        if (n < 0 || n > this.length) {
            throw Error("bytes.Buffer: truncation out of range");
        }
        this.#reslice(this.#off + n);
    }
    reset() {
        this.#reslice(0);
        this.#off = 0;
    }
    #tryGrowByReslice = (n)=>{
        const l = this.#buf.byteLength;
        if (n <= this.capacity - l) {
            this.#reslice(l + n);
            return l;
        }
        return -1;
    };
    #reslice = (len)=>{
        assert2(len <= this.#buf.buffer.byteLength);
        this.#buf = new Uint8Array(this.#buf.buffer, 0, len);
    };
    readSync(p) {
        if (this.empty()) {
            this.reset();
            if (p.byteLength === 0) {
                return 0;
            }
            return null;
        }
        const nread = copyBytes(this.#buf.subarray(this.#off), p);
        this.#off += nread;
        return nread;
    }
    read(p) {
        const rr = this.readSync(p);
        return Promise.resolve(rr);
    }
    writeSync(p) {
        const m = this.#grow(p.byteLength);
        return copyBytes(p, this.#buf, m);
    }
    write(p) {
        const n = this.writeSync(p);
        return Promise.resolve(n);
    }
    #grow = (n)=>{
        const m = this.length;
        if (m === 0 && this.#off !== 0) {
            this.reset();
        }
        const i1 = this.#tryGrowByReslice(n);
        if (i1 >= 0) {
            return i1;
        }
        const c = this.capacity;
        if (n <= Math.floor(c / 2) - m) {
            copyBytes(this.#buf.subarray(this.#off), this.#buf);
        } else if (c + n > MAX_SIZE) {
            throw new Error("The buffer cannot be grown beyond the maximum size.");
        } else {
            const buf = new Uint8Array(Math.min(2 * c + n, MAX_SIZE));
            copyBytes(this.#buf.subarray(this.#off), buf);
            this.#buf = buf;
        }
        this.#off = 0;
        this.#reslice(Math.min(m + n, MAX_SIZE));
        return m;
    };
    grow(n) {
        if (n < 0) {
            throw Error("Buffer.grow: negative count");
        }
        const m = this.#grow(n);
        this.#reslice(m);
    }
    async readFrom(r) {
        let n = 0;
        const tmp = new Uint8Array(MIN_READ);
        while(true){
            const shouldGrow = this.capacity - this.length < MIN_READ;
            const buf = shouldGrow ? tmp : new Uint8Array(this.#buf.buffer, this.length);
            const nread = await r.read(buf);
            if (nread === null) {
                return n;
            }
            if (shouldGrow) this.writeSync(buf.subarray(0, nread));
            else this.#reslice(this.length + nread);
            n += nread;
        }
    }
    readFromSync(r) {
        let n = 0;
        const tmp = new Uint8Array(MIN_READ);
        while(true){
            const shouldGrow = this.capacity - this.length < MIN_READ;
            const buf = shouldGrow ? tmp : new Uint8Array(this.#buf.buffer, this.length);
            const nread = r.readSync(buf);
            if (nread === null) {
                return n;
            }
            if (shouldGrow) this.writeSync(buf.subarray(0, nread));
            else this.#reslice(this.length + nread);
            n += nread;
        }
    }
}
function copy1(src, dst, off = 0) {
    off = Math.max(0, Math.min(off, dst.byteLength));
    const dstBytesAvailable = dst.byteLength - off;
    if (src.byteLength > dstBytesAvailable) {
        src = src.subarray(0, dstBytesAvailable);
    }
    dst.set(src, off);
    return src.byteLength;
}
const DEFAULT_BUFFER_SIZE = 32 * 1024;
async function readAll(r) {
    const buf = new Buffer();
    await buf.readFrom(r);
    return buf.bytes();
}
function readAllSync(r) {
    const buf = new Buffer();
    buf.readFromSync(r);
    return buf.bytes();
}
async function writeAll(w, arr) {
    let nwritten = 0;
    while(nwritten < arr.length){
        nwritten += await w.write(arr.subarray(nwritten));
    }
}
function writeAllSync(w, arr) {
    let nwritten = 0;
    while(nwritten < arr.length){
        nwritten += w.writeSync(arr.subarray(nwritten));
    }
}
async function* iter(r, options) {
    const bufSize = options?.bufSize ?? DEFAULT_BUFFER_SIZE;
    const b = new Uint8Array(bufSize);
    while(true){
        const result = await r.read(b);
        if (result === null) {
            break;
        }
        yield b.subarray(0, result);
    }
}
function* iterSync(r, options) {
    const bufSize = options?.bufSize ?? DEFAULT_BUFFER_SIZE;
    const b = new Uint8Array(bufSize);
    while(true){
        const result = r.readSync(b);
        if (result === null) {
            break;
        }
        yield b.subarray(0, result);
    }
}
const DEFAULT_BUF_SIZE = 4096;
const MIN_BUF_SIZE = 16;
const CR = "\r".charCodeAt(0);
const LF = "\n".charCodeAt(0);
class BufferFullError extends Error {
    partial;
    name = "BufferFullError";
    constructor(partial1){
        super("Buffer full");
        this.partial = partial1;
    }
}
class PartialReadError extends Error {
    name = "PartialReadError";
    partial;
    constructor(){
        super("Encountered UnexpectedEof, data only partially read");
    }
}
class BufReader {
    buf;
    rd;
    r = 0;
    w = 0;
    eof = false;
    static create(r, size = 4096) {
        return r instanceof BufReader ? r : new BufReader(r, size);
    }
    constructor(rd1, size1 = 4096){
        if (size1 < 16) {
            size1 = MIN_BUF_SIZE;
        }
        this._reset(new Uint8Array(size1), rd1);
    }
    size() {
        return this.buf.byteLength;
    }
    buffered() {
        return this.w - this.r;
    }
    async _fill() {
        if (this.r > 0) {
            this.buf.copyWithin(0, this.r, this.w);
            this.w -= this.r;
            this.r = 0;
        }
        if (this.w >= this.buf.byteLength) {
            throw Error("bufio: tried to fill full buffer");
        }
        for(let i1 = 100; i1 > 0; i1--){
            const rr = await this.rd.read(this.buf.subarray(this.w));
            if (rr === null) {
                this.eof = true;
                return;
            }
            assert2(rr >= 0, "negative read");
            this.w += rr;
            if (rr > 0) {
                return;
            }
        }
        throw new Error(`No progress after ${100} read() calls`);
    }
    reset(r) {
        this._reset(this.buf, r);
    }
    _reset(buf, rd) {
        this.buf = buf;
        this.rd = rd;
        this.eof = false;
    }
    async read(p) {
        let rr = p.byteLength;
        if (p.byteLength === 0) return rr;
        if (this.r === this.w) {
            if (p.byteLength >= this.buf.byteLength) {
                const rr1 = await this.rd.read(p);
                const nread = rr1 ?? 0;
                assert2(nread >= 0, "negative read");
                return rr1;
            }
            this.r = 0;
            this.w = 0;
            rr = await this.rd.read(this.buf);
            if (rr === 0 || rr === null) return rr;
            assert2(rr >= 0, "negative read");
            this.w += rr;
        }
        const copied = copy1(this.buf.subarray(this.r, this.w), p, 0);
        this.r += copied;
        return copied;
    }
    async readFull(p) {
        let bytesRead = 0;
        while(bytesRead < p.length){
            try {
                const rr = await this.read(p.subarray(bytesRead));
                if (rr === null) {
                    if (bytesRead === 0) {
                        return null;
                    } else {
                        throw new PartialReadError();
                    }
                }
                bytesRead += rr;
            } catch (err) {
                err.partial = p.subarray(0, bytesRead);
                throw err;
            }
        }
        return p;
    }
    async readByte() {
        while(this.r === this.w){
            if (this.eof) return null;
            await this._fill();
        }
        const c = this.buf[this.r];
        this.r++;
        return c;
    }
    async readString(delim) {
        if (delim.length !== 1) {
            throw new Error("Delimiter should be a single character");
        }
        const buffer = await this.readSlice(delim.charCodeAt(0));
        if (buffer === null) return null;
        return new TextDecoder().decode(buffer);
    }
    async readLine() {
        let line;
        try {
            line = await this.readSlice(LF);
        } catch (err) {
            let { partial: partial2  } = err;
            assert2(partial2 instanceof Uint8Array, "bufio: caught error from `readSlice()` without `partial` property");
            if (!(err instanceof BufferFullError)) {
                throw err;
            }
            if (!this.eof && partial2.byteLength > 0 && partial2[partial2.byteLength - 1] === CR) {
                assert2(this.r > 0, "bufio: tried to rewind past start of buffer");
                this.r--;
                partial2 = partial2.subarray(0, partial2.byteLength - 1);
            }
            return {
                line: partial2,
                more: !this.eof
            };
        }
        if (line === null) {
            return null;
        }
        if (line.byteLength === 0) {
            return {
                line,
                more: false
            };
        }
        if (line[line.byteLength - 1] == LF) {
            let drop = 1;
            if (line.byteLength > 1 && line[line.byteLength - 2] === CR) {
                drop = 2;
            }
            line = line.subarray(0, line.byteLength - drop);
        }
        return {
            line,
            more: false
        };
    }
    async readSlice(delim) {
        let s = 0;
        let slice;
        while(true){
            let i1 = this.buf.subarray(this.r + s, this.w).indexOf(delim);
            if (i1 >= 0) {
                i1 += s;
                slice = this.buf.subarray(this.r, this.r + i1 + 1);
                this.r += i1 + 1;
                break;
            }
            if (this.eof) {
                if (this.r === this.w) {
                    return null;
                }
                slice = this.buf.subarray(this.r, this.w);
                this.r = this.w;
                break;
            }
            if (this.buffered() >= this.buf.byteLength) {
                this.r = this.w;
                const oldbuf = this.buf;
                const newbuf = this.buf.slice(0);
                this.buf = newbuf;
                throw new BufferFullError(oldbuf);
            }
            s = this.w - this.r;
            try {
                await this._fill();
            } catch (err) {
                err.partial = slice;
                throw err;
            }
        }
        return slice;
    }
    async peek(n) {
        if (n < 0) {
            throw Error("negative count");
        }
        let avail = this.w - this.r;
        while(avail < n && avail < this.buf.byteLength && !this.eof){
            try {
                await this._fill();
            } catch (err) {
                err.partial = this.buf.subarray(this.r, this.w);
                throw err;
            }
            avail = this.w - this.r;
        }
        if (avail === 0 && this.eof) {
            return null;
        } else if (avail < n && this.eof) {
            return this.buf.subarray(this.r, this.r + avail);
        } else if (avail < n) {
            throw new BufferFullError(this.buf.subarray(this.r, this.w));
        }
        return this.buf.subarray(this.r, this.r + n);
    }
}
class AbstractBufBase {
    buf;
    usedBufferBytes = 0;
    err = null;
    size() {
        return this.buf.byteLength;
    }
    available() {
        return this.buf.byteLength - this.usedBufferBytes;
    }
    buffered() {
        return this.usedBufferBytes;
    }
}
class BufWriter extends AbstractBufBase {
    writer;
    static create(writer, size = 4096) {
        return writer instanceof BufWriter ? writer : new BufWriter(writer, size);
    }
    constructor(writer1, size2 = 4096){
        super();
        this.writer = writer1;
        if (size2 <= 0) {
            size2 = DEFAULT_BUF_SIZE;
        }
        this.buf = new Uint8Array(size2);
    }
    reset(w) {
        this.err = null;
        this.usedBufferBytes = 0;
        this.writer = w;
    }
    async flush() {
        if (this.err !== null) throw this.err;
        if (this.usedBufferBytes === 0) return;
        try {
            await writeAll(this.writer, this.buf.subarray(0, this.usedBufferBytes));
        } catch (e) {
            this.err = e;
            throw e;
        }
        this.buf = new Uint8Array(this.buf.length);
        this.usedBufferBytes = 0;
    }
    async write(data) {
        if (this.err !== null) throw this.err;
        if (data.length === 0) return 0;
        let totalBytesWritten = 0;
        let numBytesWritten = 0;
        while(data.byteLength > this.available()){
            if (this.buffered() === 0) {
                try {
                    numBytesWritten = await this.writer.write(data);
                } catch (e) {
                    this.err = e;
                    throw e;
                }
            } else {
                numBytesWritten = copy1(data, this.buf, this.usedBufferBytes);
                this.usedBufferBytes += numBytesWritten;
                await this.flush();
            }
            totalBytesWritten += numBytesWritten;
            data = data.subarray(numBytesWritten);
        }
        numBytesWritten = copy1(data, this.buf, this.usedBufferBytes);
        this.usedBufferBytes += numBytesWritten;
        totalBytesWritten += numBytesWritten;
        return totalBytesWritten;
    }
}
class BufWriterSync extends AbstractBufBase {
    writer;
    static create(writer, size = 4096) {
        return writer instanceof BufWriterSync ? writer : new BufWriterSync(writer, size);
    }
    constructor(writer2, size3 = 4096){
        super();
        this.writer = writer2;
        if (size3 <= 0) {
            size3 = DEFAULT_BUF_SIZE;
        }
        this.buf = new Uint8Array(size3);
    }
    reset(w) {
        this.err = null;
        this.usedBufferBytes = 0;
        this.writer = w;
    }
    flush() {
        if (this.err !== null) throw this.err;
        if (this.usedBufferBytes === 0) return;
        try {
            writeAllSync(this.writer, this.buf.subarray(0, this.usedBufferBytes));
        } catch (e) {
            this.err = e;
            throw e;
        }
        this.buf = new Uint8Array(this.buf.length);
        this.usedBufferBytes = 0;
    }
    writeSync(data) {
        if (this.err !== null) throw this.err;
        if (data.length === 0) return 0;
        let totalBytesWritten = 0;
        let numBytesWritten = 0;
        while(data.byteLength > this.available()){
            if (this.buffered() === 0) {
                try {
                    numBytesWritten = this.writer.writeSync(data);
                } catch (e) {
                    this.err = e;
                    throw e;
                }
            } else {
                numBytesWritten = copy1(data, this.buf, this.usedBufferBytes);
                this.usedBufferBytes += numBytesWritten;
                this.flush();
            }
            totalBytesWritten += numBytesWritten;
            data = data.subarray(numBytesWritten);
        }
        numBytesWritten = copy1(data, this.buf, this.usedBufferBytes);
        this.usedBufferBytes += numBytesWritten;
        totalBytesWritten += numBytesWritten;
        return totalBytesWritten;
    }
}
function createLPS(pat) {
    const lps = new Uint8Array(pat.length);
    lps[0] = 0;
    let prefixEnd = 0;
    let i1 = 1;
    while(i1 < lps.length){
        if (pat[i1] == pat[prefixEnd]) {
            prefixEnd++;
            lps[i1] = prefixEnd;
            i1++;
        } else if (prefixEnd === 0) {
            lps[i1] = 0;
            i1++;
        } else {
            prefixEnd = pat[prefixEnd - 1];
        }
    }
    return lps;
}
async function* readDelim(reader, delim) {
    const delimLen = delim.length;
    const delimLPS = createLPS(delim);
    let inputBuffer = new Buffer();
    const inspectArr = new Uint8Array(Math.max(1024, delimLen + 1));
    let inspectIndex = 0;
    let matchIndex = 0;
    while(true){
        const result = await reader.read(inspectArr);
        if (result === null) {
            yield inputBuffer.bytes();
            return;
        }
        if (result < 0) {
            return;
        }
        const sliceRead = inspectArr.subarray(0, result);
        await writeAll(inputBuffer, sliceRead);
        let sliceToProcess = inputBuffer.bytes();
        while(inspectIndex < sliceToProcess.length){
            if (sliceToProcess[inspectIndex] === delim[matchIndex]) {
                inspectIndex++;
                matchIndex++;
                if (matchIndex === delimLen) {
                    const matchEnd = inspectIndex - delimLen;
                    const readyBytes = sliceToProcess.subarray(0, matchEnd);
                    const pendingBytes = sliceToProcess.slice(inspectIndex);
                    yield readyBytes;
                    sliceToProcess = pendingBytes;
                    inspectIndex = 0;
                    matchIndex = 0;
                }
            } else {
                if (matchIndex === 0) {
                    inspectIndex++;
                } else {
                    matchIndex = delimLPS[matchIndex - 1];
                }
            }
        }
        inputBuffer = new Buffer(sliceToProcess);
    }
}
async function* readStringDelim(reader, delim) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    for await (const chunk of readDelim(reader, encoder.encode(delim))){
        yield decoder.decode(chunk);
    }
}
async function* readLines(reader) {
    for await (let chunk of readStringDelim(reader, "\n")){
        if (chunk.endsWith("\r")) {
            chunk = chunk.slice(0, -1);
        }
        yield chunk;
    }
}
const DEFAULT_BUFFER_SIZE1 = 32 * 1024;
async function copyN(r, dest, size4) {
    let bytesRead = 0;
    let buf = new Uint8Array(DEFAULT_BUFFER_SIZE1);
    while(bytesRead < size4){
        if (size4 - bytesRead < DEFAULT_BUFFER_SIZE1) {
            buf = new Uint8Array(size4 - bytesRead);
        }
        const result = await r.read(buf);
        const nread = result ?? 0;
        bytesRead += nread;
        if (nread > 0) {
            let n = 0;
            while(n < nread){
                n += await dest.write(buf.slice(n, nread));
            }
            assert2(n === nread, "could not write");
        }
        if (result === null) {
            break;
        }
    }
    return bytesRead;
}
async function readShort(buf) {
    const high = await buf.readByte();
    if (high === null) return null;
    const low = await buf.readByte();
    if (low === null) throw new Deno.errors.UnexpectedEof();
    return high << 8 | low;
}
async function readInt(buf) {
    const high = await readShort(buf);
    if (high === null) return null;
    const low = await readShort(buf);
    if (low === null) throw new Deno.errors.UnexpectedEof();
    return high << 16 | low;
}
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
async function readLong(buf) {
    const high = await readInt(buf);
    if (high === null) return null;
    const low = await readInt(buf);
    if (low === null) throw new Deno.errors.UnexpectedEof();
    const big = BigInt(high) << 32n | BigInt(low);
    if (big > MAX_SAFE_INTEGER) {
        throw new RangeError("Long value too big to be represented as a JavaScript number.");
    }
    return Number(big);
}
function sliceLongToBytes(d, dest = new Array(8)) {
    let big = BigInt(d);
    for(let i1 = 0; i1 < 8; i1++){
        dest[7 - i1] = Number(big & 255n);
        big >>= 8n;
    }
    return dest;
}
class StringReader extends Buffer {
    constructor(s){
        super(new TextEncoder().encode(s).buffer);
    }
}
class MultiReader {
    readers;
    currentIndex = 0;
    constructor(...readers1){
        this.readers = readers1;
    }
    async read(p) {
        const r = this.readers[this.currentIndex];
        if (!r) return null;
        const result = await r.read(p);
        if (result === null) {
            this.currentIndex++;
            return 0;
        }
        return result;
    }
}
class LimitedReader {
    reader;
    limit;
    constructor(reader2, limit1){
        this.reader = reader2;
        this.limit = limit1;
    }
    async read(p) {
        if (this.limit <= 0) {
            return null;
        }
        if (p.length > this.limit) {
            p = p.subarray(0, this.limit);
        }
        const n = await this.reader.read(p);
        if (n == null) {
            return null;
        }
        this.limit -= n;
        return n;
    }
}
function readerFromIterable(iterable) {
    const iterator = iterable[Symbol.asyncIterator]?.() ?? iterable[Symbol.iterator]?.();
    const buffer = new Buffer();
    return {
        async read (p) {
            if (buffer.length == 0) {
                const result = await iterator.next();
                if (result.done) {
                    return null;
                } else {
                    if (result.value.byteLength <= p.byteLength) {
                        p.set(result.value);
                        return result.value.byteLength;
                    }
                    p.set(result.value.subarray(0, p.byteLength));
                    await writeAll(buffer, result.value.subarray(p.byteLength));
                    return p.byteLength;
                }
            } else {
                const n = await buffer.read(p);
                if (n == null) {
                    return this.read(p);
                }
                return n;
            }
        }
    };
}
function writerFromStreamWriter(streamWriter) {
    return {
        async write (p) {
            await streamWriter.ready;
            await streamWriter.write(p);
            return p.length;
        }
    };
}
function readerFromStreamReader(streamReader) {
    const buffer = new Buffer();
    return {
        async read (p) {
            if (buffer.empty()) {
                const res = await streamReader.read();
                if (res.done) {
                    return null;
                }
                await writeAll(buffer, res.value);
            }
            return buffer.read(p);
        }
    };
}
function writableStreamFromWriter(writer3) {
    return new WritableStream({
        async write (chunk) {
            await writeAll(writer3, chunk);
        }
    });
}
function readableStreamFromIterable(iterable) {
    const iterator = iterable[Symbol.asyncIterator]?.() ?? iterable[Symbol.iterator]?.();
    return new ReadableStream({
        async pull (controller) {
            const { value: value3 , done  } = await iterator.next();
            if (done) {
                controller.close();
            } else {
                controller.enqueue(value3);
            }
        }
    });
}
const decoder = new TextDecoder();
class StringWriter {
    base;
    chunks = [];
    byteLength = 0;
    cache;
    constructor(base1 = ""){
        this.base = base1;
        const c = new TextEncoder().encode(base1);
        this.chunks.push(c);
        this.byteLength += c.byteLength;
    }
    write(p) {
        return Promise.resolve(this.writeSync(p));
    }
    writeSync(p) {
        this.chunks.push(p);
        this.byteLength += p.byteLength;
        this.cache = undefined;
        return p.byteLength;
    }
    toString() {
        if (this.cache) {
            return this.cache;
        }
        const buf = new Uint8Array(this.byteLength);
        let offs = 0;
        for (const chunk of this.chunks){
            buf.set(chunk, offs);
            offs += chunk.byteLength;
        }
        this.cache = decoder.decode(buf);
        return this.cache;
    }
}
const mod8 = function() {
    return {
        Buffer,
        BufferFullError,
        PartialReadError,
        BufReader,
        BufWriter,
        BufWriterSync,
        readDelim,
        readStringDelim,
        readLines,
        readAll,
        readAllSync,
        writeAll,
        writeAllSync,
        iter,
        iterSync,
        copyN,
        readShort,
        readInt,
        readLong,
        sliceLongToBytes,
        StringReader,
        MultiReader,
        LimitedReader,
        readerFromIterable,
        writerFromStreamWriter,
        readerFromStreamReader,
        writableStreamFromWriter,
        readableStreamFromIterable,
        StringWriter
    };
}();
function isRequestMessage(data2) {
    return Array.isArray(data2) && data2.length === 4 && data2[0] === 0 && typeof data2[1] === "number" && typeof data2[2] === "string" && Array.isArray(data2[3]);
}
function isResponseMessage(data2) {
    return Array.isArray(data2) && data2.length === 4 && data2[0] === 1 && typeof data2[1] === "number" && typeof data2[2] !== "undefined" && typeof data2[3] !== "undefined";
}
function isNotificationMessage(data2) {
    return Array.isArray(data2) && data2.length === 3 && data2[0] === 2 && typeof data2[1] === "string" && Array.isArray(data2[2]);
}
const MSGID_THRESHOLD = 2 ** 32;
class Session {
    #counter;
    #replies;
    #reader;
    #writer;
    #dispatcher;
    constructor(reader1, writer3, dispatcher1 = {
    }){
        this.#counter = -1;
        this.#replies = {
        };
        this.#reader = reader1;
        this.#writer = writer3;
        this.#dispatcher = dispatcher1;
    }
    getOrCreateReply(msgid) {
        this.#replies[msgid] = this.#replies[msgid] || deferred1();
        return this.#replies[msgid];
    }
    getNextIndex() {
        this.#counter += 1;
        if (this.#counter >= MSGID_THRESHOLD) {
            this.#counter = 0;
        }
        return this.#counter;
    }
    async send(data) {
        await mod8.writeAll(this.#writer, data);
    }
    async dispatch(method, ...params) {
        if (!Object.prototype.hasOwnProperty.call(this.#dispatcher, method)) {
            const propertyNames = Object.getOwnPropertyNames(this.#dispatcher);
            throw new Error(`No method '${method}' exists in ${JSON.stringify(propertyNames)}`);
        }
        return await this.#dispatcher[method].apply(this, params);
    }
    async handleRequest(request) {
        const [_, msgid, method, params] = request;
        const [result, error] = await (async ()=>{
            let result1 = null;
            let error1 = null;
            try {
                result1 = await this.dispatch(method, ...params);
            } catch (e) {
                error1 = e.stack ?? e.toString();
            }
            return [
                result1,
                error1
            ];
        })();
        const response = [
            1,
            msgid,
            error,
            result
        ];
        await mod8.writeAll(this.#writer, encode3(response));
    }
    async handleNotification(notification) {
        const [_, method, params] = notification;
        try {
            await this.dispatch(method, ...params);
        } catch (e) {
            console.error(e);
        }
    }
    async listen() {
        const stream = mod8.iter(this.#reader);
        try {
            for await (const data2 of decodeStream(stream)){
                if (isRequestMessage(data2)) {
                    this.handleRequest(data2);
                } else if (isResponseMessage(data2)) {
                    const reply = this.getOrCreateReply(data2[1]);
                    reply.resolve(data2);
                } else if (isNotificationMessage(data2)) {
                    this.handleNotification(data2);
                } else {
                    console.warn(`Unexpected data received: ${data2}`);
                    continue;
                }
            }
        } catch (e) {
            if (e instanceof Deno.errors.BadResource) {
                return;
            }
            throw e;
        }
    }
    async call(method, ...params) {
        const msgid = this.getNextIndex();
        const data2 = [
            0,
            msgid,
            method,
            params
        ];
        await this.send(encode3(data2));
        const [err, result] = (await this.getOrCreateReply(msgid)).slice(2);
        delete this.#replies[msgid];
        if (err) {
            const paramsStr = JSON.stringify(params);
            const errStr = typeof err === "string" ? err : JSON.stringify(err);
            throw new Error(`Failed to call '${method}' with ${paramsStr}: ${errStr}`);
        }
        return result;
    }
    async notify(method, ...params) {
        const data2 = [
            2,
            method,
            params
        ];
        await this.send(encode3(data2));
    }
    clearDispatcher() {
        this.#dispatcher = {
        };
    }
    extendDispatcher(dispatcher) {
        this.#dispatcher = {
            ...this.#dispatcher,
            ...dispatcher
        };
    }
}
const MIN_READ1 = 32 * 1024;
const MAX_SIZE1 = 2 ** 32 - 2;
function copyBytes1(src, dst, off = 0) {
    const r = dst.byteLength - off;
    if (src.byteLength > r) {
        src = src.subarray(0, r);
    }
    dst.set(src, off);
    return src.byteLength;
}
class Buffer1 {
    #buf;
    #off = 0;
    constructor(ab1){
        if (ab1 === undefined) {
            this.#buf = new Uint8Array(0);
            return;
        }
        this.#buf = new Uint8Array(ab1);
    }
    bytes(options = {
        copy: true
    }) {
        if (options.copy === false) return this.#buf.subarray(this.#off);
        return this.#buf.slice(this.#off);
    }
    empty() {
        return this.#buf.byteLength <= this.#off;
    }
    get length() {
        return this.#buf.byteLength - this.#off;
    }
    get capacity() {
        return this.#buf.buffer.byteLength;
    }
    truncate(n) {
        if (n === 0) {
            this.reset();
            return;
        }
        if (n < 0 || n > this.length) {
            throw Error("bytes.Buffer: truncation out of range");
        }
        this.#reslice(this.#off + n);
    }
    reset() {
        this.#reslice(0);
        this.#off = 0;
    }
    #tryGrowByReslice = (n)=>{
        const l = this.#buf.byteLength;
        if (n <= this.capacity - l) {
            this.#reslice(l + n);
            return l;
        }
        return -1;
    };
    #reslice = (len)=>{
        assert1(len <= this.#buf.buffer.byteLength);
        this.#buf = new Uint8Array(this.#buf.buffer, 0, len);
    };
    readSync(p) {
        if (this.empty()) {
            this.reset();
            if (p.byteLength === 0) {
                return 0;
            }
            return null;
        }
        const nread = copyBytes1(this.#buf.subarray(this.#off), p);
        this.#off += nread;
        return nread;
    }
    read(p) {
        const rr = this.readSync(p);
        return Promise.resolve(rr);
    }
    writeSync(p) {
        const m = this.#grow(p.byteLength);
        return copyBytes1(p, this.#buf, m);
    }
    write(p) {
        const n = this.writeSync(p);
        return Promise.resolve(n);
    }
    #grow = (n)=>{
        const m = this.length;
        if (m === 0 && this.#off !== 0) {
            this.reset();
        }
        const i1 = this.#tryGrowByReslice(n);
        if (i1 >= 0) {
            return i1;
        }
        const c1 = this.capacity;
        if (n <= Math.floor(c1 / 2) - m) {
            copyBytes1(this.#buf.subarray(this.#off), this.#buf);
        } else if (c1 + n > MAX_SIZE1) {
            throw new Error("The buffer cannot be grown beyond the maximum size.");
        } else {
            const buf = new Uint8Array(Math.min(2 * c1 + n, MAX_SIZE1));
            copyBytes1(this.#buf.subarray(this.#off), buf);
            this.#buf = buf;
        }
        this.#off = 0;
        this.#reslice(Math.min(m + n, MAX_SIZE1));
        return m;
    };
    grow(n) {
        if (n < 0) {
            throw Error("Buffer.grow: negative count");
        }
        const m = this.#grow(n);
        this.#reslice(m);
    }
    async readFrom(r) {
        let n = 0;
        const tmp = new Uint8Array(MIN_READ1);
        while(true){
            const shouldGrow = this.capacity - this.length < MIN_READ1;
            const buf = shouldGrow ? tmp : new Uint8Array(this.#buf.buffer, this.length);
            const nread = await r.read(buf);
            if (nread === null) {
                return n;
            }
            if (shouldGrow) this.writeSync(buf.subarray(0, nread));
            else this.#reslice(this.length + nread);
            n += nread;
        }
    }
    readFromSync(r) {
        let n = 0;
        const tmp = new Uint8Array(MIN_READ1);
        while(true){
            const shouldGrow = this.capacity - this.length < MIN_READ1;
            const buf = shouldGrow ? tmp : new Uint8Array(this.#buf.buffer, this.length);
            const nread = r.readSync(buf);
            if (nread === null) {
                return n;
            }
            if (shouldGrow) this.writeSync(buf.subarray(0, nread));
            else this.#reslice(this.length + nread);
            n += nread;
        }
    }
}
function copy2(src, dst, off = 0) {
    off = Math.max(0, Math.min(off, dst.byteLength));
    const dstBytesAvailable = dst.byteLength - off;
    if (src.byteLength > dstBytesAvailable) {
        src = src.subarray(0, dstBytesAvailable);
    }
    dst.set(src, off);
    return src.byteLength;
}
const DEFAULT_BUFFER_SIZE2 = 32 * 1024;
async function readAll1(r) {
    const buf = new Buffer1();
    await buf.readFrom(r);
    return buf.bytes();
}
function readAllSync1(r) {
    const buf = new Buffer1();
    buf.readFromSync(r);
    return buf.bytes();
}
async function writeAll1(w, arr) {
    let nwritten = 0;
    while(nwritten < arr.length){
        nwritten += await w.write(arr.subarray(nwritten));
    }
}
function writeAllSync1(w, arr) {
    let nwritten = 0;
    while(nwritten < arr.length){
        nwritten += w.writeSync(arr.subarray(nwritten));
    }
}
async function* iter1(r, options) {
    const bufSize = options?.bufSize ?? DEFAULT_BUFFER_SIZE2;
    const b = new Uint8Array(bufSize);
    while(true){
        const result = await r.read(b);
        if (result === null) {
            break;
        }
        yield b.subarray(0, result);
    }
}
function* iterSync1(r, options) {
    const bufSize = options?.bufSize ?? DEFAULT_BUFFER_SIZE2;
    const b = new Uint8Array(bufSize);
    while(true){
        const result = r.readSync(b);
        if (result === null) {
            break;
        }
        yield b.subarray(0, result);
    }
}
const DEFAULT_BUF_SIZE1 = 4096;
const MIN_BUF_SIZE1 = 16;
const CR1 = "\r".charCodeAt(0);
const LF1 = "\n".charCodeAt(0);
class BufferFullError1 extends Error {
    partial;
    name = "BufferFullError";
    constructor(partial2){
        super("Buffer full");
        this.partial = partial2;
    }
}
class PartialReadError1 extends Error {
    name = "PartialReadError";
    partial;
    constructor(){
        super("Encountered UnexpectedEof, data only partially read");
    }
}
class BufReader1 {
    buf;
    rd;
    r = 0;
    w = 0;
    eof = false;
    static create(r, size = 4096) {
        return r instanceof BufReader1 ? r : new BufReader1(r, size);
    }
    constructor(rd2, size4 = 4096){
        if (size4 < 16) {
            size4 = MIN_BUF_SIZE1;
        }
        this._reset(new Uint8Array(size4), rd2);
    }
    size() {
        return this.buf.byteLength;
    }
    buffered() {
        return this.w - this.r;
    }
    async _fill() {
        if (this.r > 0) {
            this.buf.copyWithin(0, this.r, this.w);
            this.w -= this.r;
            this.r = 0;
        }
        if (this.w >= this.buf.byteLength) {
            throw Error("bufio: tried to fill full buffer");
        }
        for(let i1 = 100; i1 > 0; i1--){
            const rr = await this.rd.read(this.buf.subarray(this.w));
            if (rr === null) {
                this.eof = true;
                return;
            }
            assert1(rr >= 0, "negative read");
            this.w += rr;
            if (rr > 0) {
                return;
            }
        }
        throw new Error(`No progress after ${100} read() calls`);
    }
    reset(r) {
        this._reset(this.buf, r);
    }
    _reset(buf, rd) {
        this.buf = buf;
        this.rd = rd;
        this.eof = false;
    }
    async read(p) {
        let rr = p.byteLength;
        if (p.byteLength === 0) return rr;
        if (this.r === this.w) {
            if (p.byteLength >= this.buf.byteLength) {
                const rr1 = await this.rd.read(p);
                const nread = rr1 ?? 0;
                assert1(nread >= 0, "negative read");
                return rr1;
            }
            this.r = 0;
            this.w = 0;
            rr = await this.rd.read(this.buf);
            if (rr === 0 || rr === null) return rr;
            assert1(rr >= 0, "negative read");
            this.w += rr;
        }
        const copied = copy2(this.buf.subarray(this.r, this.w), p, 0);
        this.r += copied;
        return copied;
    }
    async readFull(p) {
        let bytesRead = 0;
        while(bytesRead < p.length){
            try {
                const rr = await this.read(p.subarray(bytesRead));
                if (rr === null) {
                    if (bytesRead === 0) {
                        return null;
                    } else {
                        throw new PartialReadError1();
                    }
                }
                bytesRead += rr;
            } catch (err) {
                err.partial = p.subarray(0, bytesRead);
                throw err;
            }
        }
        return p;
    }
    async readByte() {
        while(this.r === this.w){
            if (this.eof) return null;
            await this._fill();
        }
        const c1 = this.buf[this.r];
        this.r++;
        return c1;
    }
    async readString(delim) {
        if (delim.length !== 1) {
            throw new Error("Delimiter should be a single character");
        }
        const buffer = await this.readSlice(delim.charCodeAt(0));
        if (buffer === null) return null;
        return new TextDecoder().decode(buffer);
    }
    async readLine() {
        let line;
        try {
            line = await this.readSlice(LF1);
        } catch (err) {
            let { partial: partial3  } = err;
            assert1(partial3 instanceof Uint8Array, "bufio: caught error from `readSlice()` without `partial` property");
            if (!(err instanceof BufferFullError1)) {
                throw err;
            }
            if (!this.eof && partial3.byteLength > 0 && partial3[partial3.byteLength - 1] === CR1) {
                assert1(this.r > 0, "bufio: tried to rewind past start of buffer");
                this.r--;
                partial3 = partial3.subarray(0, partial3.byteLength - 1);
            }
            return {
                line: partial3,
                more: !this.eof
            };
        }
        if (line === null) {
            return null;
        }
        if (line.byteLength === 0) {
            return {
                line,
                more: false
            };
        }
        if (line[line.byteLength - 1] == LF1) {
            let drop = 1;
            if (line.byteLength > 1 && line[line.byteLength - 2] === CR1) {
                drop = 2;
            }
            line = line.subarray(0, line.byteLength - drop);
        }
        return {
            line,
            more: false
        };
    }
    async readSlice(delim) {
        let s1 = 0;
        let slice;
        while(true){
            let i1 = this.buf.subarray(this.r + s1, this.w).indexOf(delim);
            if (i1 >= 0) {
                i1 += s1;
                slice = this.buf.subarray(this.r, this.r + i1 + 1);
                this.r += i1 + 1;
                break;
            }
            if (this.eof) {
                if (this.r === this.w) {
                    return null;
                }
                slice = this.buf.subarray(this.r, this.w);
                this.r = this.w;
                break;
            }
            if (this.buffered() >= this.buf.byteLength) {
                this.r = this.w;
                const oldbuf = this.buf;
                const newbuf = this.buf.slice(0);
                this.buf = newbuf;
                throw new BufferFullError1(oldbuf);
            }
            s1 = this.w - this.r;
            try {
                await this._fill();
            } catch (err) {
                err.partial = slice;
                throw err;
            }
        }
        return slice;
    }
    async peek(n) {
        if (n < 0) {
            throw Error("negative count");
        }
        let avail = this.w - this.r;
        while(avail < n && avail < this.buf.byteLength && !this.eof){
            try {
                await this._fill();
            } catch (err) {
                err.partial = this.buf.subarray(this.r, this.w);
                throw err;
            }
            avail = this.w - this.r;
        }
        if (avail === 0 && this.eof) {
            return null;
        } else if (avail < n && this.eof) {
            return this.buf.subarray(this.r, this.r + avail);
        } else if (avail < n) {
            throw new BufferFullError1(this.buf.subarray(this.r, this.w));
        }
        return this.buf.subarray(this.r, this.r + n);
    }
}
class AbstractBufBase1 {
    buf;
    usedBufferBytes = 0;
    err = null;
    size() {
        return this.buf.byteLength;
    }
    available() {
        return this.buf.byteLength - this.usedBufferBytes;
    }
    buffered() {
        return this.usedBufferBytes;
    }
}
class BufWriter1 extends AbstractBufBase1 {
    writer;
    static create(writer, size = 4096) {
        return writer instanceof BufWriter1 ? writer : new BufWriter1(writer, size);
    }
    constructor(writer4, size5 = 4096){
        super();
        this.writer = writer4;
        if (size5 <= 0) {
            size5 = DEFAULT_BUF_SIZE1;
        }
        this.buf = new Uint8Array(size5);
    }
    reset(w) {
        this.err = null;
        this.usedBufferBytes = 0;
        this.writer = w;
    }
    async flush() {
        if (this.err !== null) throw this.err;
        if (this.usedBufferBytes === 0) return;
        try {
            await writeAll1(this.writer, this.buf.subarray(0, this.usedBufferBytes));
        } catch (e) {
            this.err = e;
            throw e;
        }
        this.buf = new Uint8Array(this.buf.length);
        this.usedBufferBytes = 0;
    }
    async write(data) {
        if (this.err !== null) throw this.err;
        if (data.length === 0) return 0;
        let totalBytesWritten = 0;
        let numBytesWritten = 0;
        while(data.byteLength > this.available()){
            if (this.buffered() === 0) {
                try {
                    numBytesWritten = await this.writer.write(data);
                } catch (e) {
                    this.err = e;
                    throw e;
                }
            } else {
                numBytesWritten = copy2(data, this.buf, this.usedBufferBytes);
                this.usedBufferBytes += numBytesWritten;
                await this.flush();
            }
            totalBytesWritten += numBytesWritten;
            data = data.subarray(numBytesWritten);
        }
        numBytesWritten = copy2(data, this.buf, this.usedBufferBytes);
        this.usedBufferBytes += numBytesWritten;
        totalBytesWritten += numBytesWritten;
        return totalBytesWritten;
    }
}
class BufWriterSync1 extends AbstractBufBase1 {
    writer;
    static create(writer, size = 4096) {
        return writer instanceof BufWriterSync1 ? writer : new BufWriterSync1(writer, size);
    }
    constructor(writer5, size6 = 4096){
        super();
        this.writer = writer5;
        if (size6 <= 0) {
            size6 = DEFAULT_BUF_SIZE1;
        }
        this.buf = new Uint8Array(size6);
    }
    reset(w) {
        this.err = null;
        this.usedBufferBytes = 0;
        this.writer = w;
    }
    flush() {
        if (this.err !== null) throw this.err;
        if (this.usedBufferBytes === 0) return;
        try {
            writeAllSync1(this.writer, this.buf.subarray(0, this.usedBufferBytes));
        } catch (e) {
            this.err = e;
            throw e;
        }
        this.buf = new Uint8Array(this.buf.length);
        this.usedBufferBytes = 0;
    }
    writeSync(data) {
        if (this.err !== null) throw this.err;
        if (data.length === 0) return 0;
        let totalBytesWritten = 0;
        let numBytesWritten = 0;
        while(data.byteLength > this.available()){
            if (this.buffered() === 0) {
                try {
                    numBytesWritten = this.writer.writeSync(data);
                } catch (e) {
                    this.err = e;
                    throw e;
                }
            } else {
                numBytesWritten = copy2(data, this.buf, this.usedBufferBytes);
                this.usedBufferBytes += numBytesWritten;
                this.flush();
            }
            totalBytesWritten += numBytesWritten;
            data = data.subarray(numBytesWritten);
        }
        numBytesWritten = copy2(data, this.buf, this.usedBufferBytes);
        this.usedBufferBytes += numBytesWritten;
        totalBytesWritten += numBytesWritten;
        return totalBytesWritten;
    }
}
function createLPS1(pat) {
    const lps = new Uint8Array(pat.length);
    lps[0] = 0;
    let prefixEnd = 0;
    let i1 = 1;
    while(i1 < lps.length){
        if (pat[i1] == pat[prefixEnd]) {
            prefixEnd++;
            lps[i1] = prefixEnd;
            i1++;
        } else if (prefixEnd === 0) {
            lps[i1] = 0;
            i1++;
        } else {
            prefixEnd = pat[prefixEnd - 1];
        }
    }
    return lps;
}
async function* readDelim1(reader2, delim) {
    const delimLen = delim.length;
    const delimLPS = createLPS1(delim);
    let inputBuffer = new Buffer1();
    const inspectArr = new Uint8Array(Math.max(1024, delimLen + 1));
    let inspectIndex = 0;
    let matchIndex = 0;
    while(true){
        const result = await reader2.read(inspectArr);
        if (result === null) {
            yield inputBuffer.bytes();
            return;
        }
        if (result < 0) {
            return;
        }
        const sliceRead = inspectArr.subarray(0, result);
        await writeAll1(inputBuffer, sliceRead);
        let sliceToProcess = inputBuffer.bytes();
        while(inspectIndex < sliceToProcess.length){
            if (sliceToProcess[inspectIndex] === delim[matchIndex]) {
                inspectIndex++;
                matchIndex++;
                if (matchIndex === delimLen) {
                    const matchEnd = inspectIndex - delimLen;
                    const readyBytes = sliceToProcess.subarray(0, matchEnd);
                    const pendingBytes = sliceToProcess.slice(inspectIndex);
                    yield readyBytes;
                    sliceToProcess = pendingBytes;
                    inspectIndex = 0;
                    matchIndex = 0;
                }
            } else {
                if (matchIndex === 0) {
                    inspectIndex++;
                } else {
                    matchIndex = delimLPS[matchIndex - 1];
                }
            }
        }
        inputBuffer = new Buffer1(sliceToProcess);
    }
}
async function* readStringDelim1(reader2, delim) {
    const encoder = new TextEncoder();
    const decoder1 = new TextDecoder();
    for await (const chunk of readDelim1(reader2, encoder.encode(delim))){
        yield decoder1.decode(chunk);
    }
}
async function* readLines1(reader2) {
    for await (let chunk of readStringDelim1(reader2, "\n")){
        if (chunk.endsWith("\r")) {
            chunk = chunk.slice(0, -1);
        }
        yield chunk;
    }
}
const DEFAULT_BUFFER_SIZE3 = 32 * 1024;
async function copyN1(r, dest, size7) {
    let bytesRead = 0;
    let buf = new Uint8Array(DEFAULT_BUFFER_SIZE3);
    while(bytesRead < size7){
        if (size7 - bytesRead < DEFAULT_BUFFER_SIZE3) {
            buf = new Uint8Array(size7 - bytesRead);
        }
        const result = await r.read(buf);
        const nread = result ?? 0;
        bytesRead += nread;
        if (nread > 0) {
            let n = 0;
            while(n < nread){
                n += await dest.write(buf.slice(n, nread));
            }
            assert1(n === nread, "could not write");
        }
        if (result === null) {
            break;
        }
    }
    return bytesRead;
}
async function readShort1(buf) {
    const high = await buf.readByte();
    if (high === null) return null;
    const low = await buf.readByte();
    if (low === null) throw new Deno.errors.UnexpectedEof();
    return high << 8 | low;
}
async function readInt1(buf) {
    const high = await readShort1(buf);
    if (high === null) return null;
    const low = await readShort1(buf);
    if (low === null) throw new Deno.errors.UnexpectedEof();
    return high << 16 | low;
}
const MAX_SAFE_INTEGER1 = BigInt(Number.MAX_SAFE_INTEGER);
async function readLong1(buf) {
    const high = await readInt1(buf);
    if (high === null) return null;
    const low = await readInt1(buf);
    if (low === null) throw new Deno.errors.UnexpectedEof();
    const big = BigInt(high) << 32n | BigInt(low);
    if (big > MAX_SAFE_INTEGER1) {
        throw new RangeError("Long value too big to be represented as a JavaScript number.");
    }
    return Number(big);
}
function sliceLongToBytes1(d, dest = new Array(8)) {
    let big = BigInt(d);
    for(let i1 = 0; i1 < 8; i1++){
        dest[7 - i1] = Number(big & 255n);
        big >>= 8n;
    }
    return dest;
}
class StringReader1 extends Buffer1 {
    constructor(s1){
        super(new TextEncoder().encode(s1).buffer);
    }
}
class MultiReader1 {
    readers;
    currentIndex = 0;
    constructor(...readers2){
        this.readers = readers2;
    }
    async read(p) {
        const r = this.readers[this.currentIndex];
        if (!r) return null;
        const result = await r.read(p);
        if (result === null) {
            this.currentIndex++;
            return 0;
        }
        return result;
    }
}
class LimitedReader1 {
    reader;
    limit;
    constructor(reader3, limit2){
        this.reader = reader3;
        this.limit = limit2;
    }
    async read(p) {
        if (this.limit <= 0) {
            return null;
        }
        if (p.length > this.limit) {
            p = p.subarray(0, this.limit);
        }
        const n = await this.reader.read(p);
        if (n == null) {
            return null;
        }
        this.limit -= n;
        return n;
    }
}
function readerFromIterable1(iterable) {
    const iterator = iterable[Symbol.asyncIterator]?.() ?? iterable[Symbol.iterator]?.();
    const buffer = new Buffer1();
    return {
        async read (p) {
            if (buffer.length == 0) {
                const result = await iterator.next();
                if (result.done) {
                    return null;
                } else {
                    if (result.value.byteLength <= p.byteLength) {
                        p.set(result.value);
                        return result.value.byteLength;
                    }
                    p.set(result.value.subarray(0, p.byteLength));
                    await writeAll1(buffer, result.value.subarray(p.byteLength));
                    return p.byteLength;
                }
            } else {
                const n = await buffer.read(p);
                if (n == null) {
                    return this.read(p);
                }
                return n;
            }
        }
    };
}
function writerFromStreamWriter1(streamWriter) {
    return {
        async write (p) {
            await streamWriter.ready;
            await streamWriter.write(p);
            return p.length;
        }
    };
}
function readerFromStreamReader1(streamReader) {
    const buffer = new Buffer1();
    return {
        async read (p) {
            if (buffer.empty()) {
                const res = await streamReader.read();
                if (res.done) {
                    return null;
                }
                await writeAll1(buffer, res.value);
            }
            return buffer.read(p);
        }
    };
}
function writableStreamFromWriter1(writer6) {
    return new WritableStream({
        async write (chunk) {
            await writeAll1(writer6, chunk);
        }
    });
}
function readableStreamFromIterable1(iterable) {
    const iterator = iterable[Symbol.asyncIterator]?.() ?? iterable[Symbol.iterator]?.();
    return new ReadableStream({
        async pull (controller) {
            const { value: value3 , done  } = await iterator.next();
            if (done) {
                controller.close();
            } else {
                controller.enqueue(value3);
            }
        }
    });
}
const decoder1 = new TextDecoder();
class StringWriter1 {
    base;
    chunks = [];
    byteLength = 0;
    cache;
    constructor(base2 = ""){
        this.base = base2;
        const c1 = new TextEncoder().encode(base2);
        this.chunks.push(c1);
        this.byteLength += c1.byteLength;
    }
    write(p) {
        return Promise.resolve(this.writeSync(p));
    }
    writeSync(p) {
        this.chunks.push(p);
        this.byteLength += p.byteLength;
        this.cache = undefined;
        return p.byteLength;
    }
    toString() {
        if (this.cache) {
            return this.cache;
        }
        const buf = new Uint8Array(this.byteLength);
        let offs = 0;
        for (const chunk of this.chunks){
            buf.set(chunk, offs);
            offs += chunk.byteLength;
        }
        this.cache = decoder1.decode(buf);
        return this.cache;
    }
}
const mod9 = function() {
    return {
        Buffer: Buffer1,
        BufferFullError: BufferFullError1,
        PartialReadError: PartialReadError1,
        BufReader: BufReader1,
        BufWriter: BufWriter1,
        BufWriterSync: BufWriterSync1,
        readDelim: readDelim1,
        readStringDelim: readStringDelim1,
        readLines: readLines1,
        readAll: readAll1,
        readAllSync: readAllSync1,
        writeAll: writeAll1,
        writeAllSync: writeAllSync1,
        iter: iter1,
        iterSync: iterSync1,
        copyN: copyN1,
        readShort: readShort1,
        readInt: readInt1,
        readLong: readLong1,
        sliceLongToBytes: sliceLongToBytes1,
        StringReader: StringReader1,
        MultiReader: MultiReader1,
        LimitedReader: LimitedReader1,
        readerFromIterable: readerFromIterable1,
        writerFromStreamWriter: writerFromStreamWriter1,
        readerFromStreamReader: readerFromStreamReader1,
        writableStreamFromWriter: writableStreamFromWriter1,
        readableStreamFromIterable: readableStreamFromIterable1,
        StringWriter: StringWriter1
    };
}();
function isMessage(data2) {
    return Array.isArray(data2) && data2.length === 2 && typeof data2[0] === "number" && typeof data2[1] !== "undefined";
}
const MSGID_THRESHOLD1 = 2 ** 32;
const utf8Encoder = new TextEncoder();
class Session1 {
    #counter;
    #replies;
    #reader;
    #writer;
    #callback;
    constructor(reader4, writer6, callback1 = ()=>undefined
    ){
        this.#counter = 0;
        this.#replies = {
        };
        this.#reader = reader4;
        this.#writer = writer6;
        this.#callback = callback1;
    }
    getOrCreateReply(msgid) {
        this.#replies[msgid] = this.#replies[msgid] || deferred1();
        return this.#replies[msgid];
    }
    getNextIndex() {
        this.#counter += 1;
        if (this.#counter >= MSGID_THRESHOLD1) {
            this.#counter = 1;
        }
        return this.#counter * -1;
    }
    async send(data) {
        await mod9.writeAll(this.#writer, data);
    }
    async listen() {
        const stream = mod9.readLines(this.#reader);
        try {
            for await (const text of stream){
                if (!text) {
                    continue;
                }
                try {
                    const data2 = JSON.parse(text);
                    if (!isMessage(data2)) {
                        console.warn(`Unexpected data received: ${data2}`);
                        continue;
                    }
                    const reply = this.#replies[data2[0]];
                    if (!reply) {
                        this.#callback.apply(this, [
                            data2
                        ]);
                        continue;
                    }
                    reply.resolve(data2);
                } catch (e) {
                    console.warn(`Failed to parse received text '${text}': ${e}`);
                    continue;
                }
            }
        } catch (e) {
            if (e instanceof Deno.errors.BadResource) {
                return;
            }
            throw e;
        }
    }
    async reply(msgid, expr) {
        const data2 = [
            msgid,
            expr
        ];
        await this.send(utf8Encoder.encode(JSON.stringify(data2)));
    }
    async redraw(force = false) {
        const data2 = [
            "redraw",
            force ? "force" : ""
        ];
        await this.send(utf8Encoder.encode(JSON.stringify(data2)));
    }
    async ex(expr) {
        const data2 = [
            "ex",
            expr
        ];
        await this.send(utf8Encoder.encode(JSON.stringify(data2)));
    }
    async normal(expr) {
        const data2 = [
            "normal",
            expr
        ];
        await this.send(utf8Encoder.encode(JSON.stringify(data2)));
    }
    async expr(expr) {
        const msgid = this.getNextIndex();
        const data2 = [
            "expr",
            expr,
            msgid
        ];
        const reply = deferred1();
        this.#replies[msgid] = reply;
        await this.send(utf8Encoder.encode(JSON.stringify(data2)));
        return (await reply)[1];
    }
    async exprNoReply(expr) {
        const data2 = [
            "expr",
            expr
        ];
        await this.send(utf8Encoder.encode(JSON.stringify(data2)));
    }
    async call(fn, ...args) {
        const msgid = this.getNextIndex();
        const data2 = [
            "call",
            fn,
            args,
            msgid
        ];
        const reply = deferred1();
        this.#replies[msgid] = reply;
        await this.send(utf8Encoder.encode(JSON.stringify(data2)));
        return (await reply)[1];
    }
    async callNoReply(fn, ...args) {
        const data2 = [
            "call",
            fn,
            args
        ];
        await this.send(utf8Encoder.encode(JSON.stringify(data2)));
    }
    replaceCallback(callback) {
        this.#callback = callback;
    }
}
class WorkerReader {
    #queue;
    #remain;
    #closed;
    #worker;
    constructor(worker){
        this.#queue = new Queue();
        this.#remain = new Uint8Array();
        this.#closed = false;
        this.#worker = worker;
        this.#worker.onmessage = (e)=>{
            if (this.#queue && !this.#closed) {
                this.#queue.put_nowait(new Uint8Array(e.data));
            }
        };
    }
    async read(p) {
        if (this.#remain.length) {
            return await Promise.resolve(this.readFromRemain(p));
        }
        if (!this.#queue || this.#closed && this.#queue.empty()) {
            this.#queue = undefined;
            return await Promise.resolve(null);
        }
        this.#remain = await this.#queue.get();
        return this.readFromRemain(p);
    }
    readFromRemain(p) {
        const n = p.byteLength;
        const d = this.#remain.slice(0, n);
        this.#remain = this.#remain.slice(n);
        p.set(d);
        return d.byteLength;
    }
    close() {
        this.#closed = true;
        this.#worker.terminate();
    }
}
class WorkerWriter {
    #worker;
    constructor(worker1){
        this.#worker = worker1;
    }
    write(p) {
        this.#worker.postMessage(Array.from(p));
        return Promise.resolve(p.length);
    }
}
const DENOPS_TEST_VIM = Deno.env.get("DENOPS_TEST_VIM");
const DENOPS_TEST_NVIM = Deno.env.get("DENOPS_TEST_NVIM");
function run(mode, options = {
}) {
    const timeout = options.timeout ?? 1000;
    const args = mode === "vim" ? buildVimArgs() : buildNvimArgs();
    const cmds = [
        "--cmd",
        `call timer_start(${timeout}, { -> execute('qall!') })`,
        ...(options.commands ?? []).map((c2)=>[
                "--cmd",
                c2
            ]
        ).flat(), 
    ];
    const proc = Deno.run({
        cmd: [
            ...args,
            ...cmds
        ],
        env: options.env,
        stdin: "piped"
    });
    return proc;
}
function buildVimArgs() {
    if (!DENOPS_TEST_VIM) {
        throw new Error("`DENOPS_TEST_VIM` environment variable is not defined");
    }
    return [
        DENOPS_TEST_VIM,
        "-u",
        "NONE",
        "-i",
        "NONE",
        "-N",
        "-X",
        "-e",
        "-s", 
    ];
}
function buildNvimArgs() {
    if (!DENOPS_TEST_NVIM) {
        throw new Error("`DENOPS_TEST_NVIM` environment variable is not defined");
    }
    return [
        DENOPS_TEST_NVIM,
        "--clean",
        "--embed",
        "--headless", 
    ];
}
class Denops {
    static instance;
    #name;
    #session;
    constructor(name1, reader5, writer7){
        this.#name = name1;
        this.#session = new Session(reader5, writer7);
        this.#session.listen().catch((e)=>{
            if (e.name === "Interrupted") {
                return;
            }
            console.error(`Unexpected error occurred in '${name1}'`, e);
        });
    }
    static get() {
        if (!Denops.instance) {
            const worker2 = self;
            const reader6 = new WorkerReader(worker2);
            const writer8 = new WorkerWriter(worker2);
            Denops.instance = new Denops(worker2.name, reader6, writer8);
        }
        return Denops.instance;
    }
    static start(init) {
        const denops1 = Denops.get();
        const runner = async ()=>{
            try {
                await init(denops1);
            } catch (e) {
                console.error(`Unexpected error occurred in '${denops1.name}'`, e);
            }
        };
        runner();
    }
    static test(t, name, fn) {
        if (typeof t === "string" && typeof name === "string" && fn != undefined) {
            test({
                mode: t,
                name,
                fn
            });
        } else if (typeof t === "string" && name != undefined) {
            test({
                mode: "both",
                name: t,
                fn: name
            });
        } else if (typeof t === "object") {
            test(t);
        }
    }
    get name() {
        return this.#name;
    }
    async dispatch(name, fn, ...args) {
        return await this.#session.call("dispatch", name, fn, ...args);
    }
    async call(fn, ...args) {
        return await this.#session.call("call", fn, ...args);
    }
    async cmd(cmd, ctx = {
    }) {
        await this.#session.call("call", "denops#api#cmd", cmd, ctx);
    }
    async eval(expr, ctx = {
    }) {
        return await this.#session.call("call", "denops#api#eval", expr, ctx);
    }
    extendDispatcher(dispatcher) {
        this.#session.extendDispatcher(dispatcher);
    }
    clearDispatcher() {
        this.#session.clearDispatcher();
    }
}
const DENOPS_PATH = Deno.env.get("DENOPS_PATH");
async function withDenops(mode, main) {
    if (!DENOPS_PATH) {
        throw new Error("`DENOPS_PATH` environment variable is not defined");
    }
    const denopsPath = mod7.resolve(DENOPS_PATH);
    const scriptPath = mod7.join(denopsPath, "denops", "@denops", "test", "cli", "bypass.ts");
    const listener = Deno.listen({
        hostname: "127.0.0.1",
        port: 0
    });
    const proc = run(mode, {
        commands: [
            `set runtimepath^=${DENOPS_PATH}`,
            `autocmd User DenopsReady call denops#plugin#register('denops-std-test', '${scriptPath}')`,
            "call denops#server#start()", 
        ],
        env: {
            "DENOPS_TEST_ADDRESS": JSON.stringify(listener.addr)
        }
    });
    try {
        const conn = await listener.accept();
        const denops1 = new Denops("denops-std-test", conn, conn);
        try {
            await main(denops1);
        } finally{
            denops1.cmd("qall!");
            await proc.status();
            proc.stdin?.close();
            proc.close();
            conn.close();
        }
    } finally{
        listener.close();
    }
}
function test(t) {
    const mode = t.mode;
    if (mode === "both") {
        test({
            ...t,
            name: `${t.name} (vim)`,
            mode: "vim"
        });
        test({
            ...t,
            name: `${t.name} (nvim)`,
            mode: "nvim"
        });
    } else if (mode === "one") {
        const m = DENOPS_TEST_NVIM ? "nvim" : "vim";
        test({
            ...t,
            name: `${t.name} (${m})`,
            mode: m
        });
    } else {
        Deno.test({
            ...t,
            ignore: !DENOPS_PATH || mode === "vim" && !DENOPS_TEST_VIM || mode === "nvim" && !DENOPS_TEST_NVIM,
            fn: async ()=>{
                await withDenops(mode, t.fn);
            }
        });
    }
}
function ensureString(x, name2 = "value") {
    if (typeof x !== "string") {
        throw new Error(`The ${name2} must be a string`);
    }
}
async function load1(denops1, url) {
    const scriptPath = await ensureLocalFile(url);
    await execute(denops1, "execute printf('source %s', fnameescape(scriptPath)) ", {
        scriptPath
    });
}
async function ensureLocalFile(url) {
    if (url.protocol === "file:") {
        return mod2.fromFileUrl(url);
    }
    const cacheDir = await getOrCreateCacheDir();
    const filename = getLocalFilename(url);
    const filepath = mod2.join(cacheDir, filename);
    if (await mod4.exists(filepath)) {
        return filepath;
    }
    const response = await fetch(url);
    if (response.status !== 200) {
        throw new Error(`Failed to fetch '${url}'`);
    }
    const content = await response.arrayBuffer();
    await Deno.writeFile(filepath, new Uint8Array(content), {
        mode: 448
    });
    return filepath;
}
function getLocalFilename(url) {
    const h = mod3.createHash("sha256");
    h.update(url.href);
    const basename6 = mod2.basename(url.pathname);
    return `${h.digest()}-${basename6}`;
}
async function getOrCreateCacheDir() {
    const cacheDir = Deno.build.os === "windows" ? getCacheDirWindows() : getCacheDirUnix();
    await Deno.mkdir(cacheDir, {
        recursive: true
    });
    return cacheDir;
}
function getCacheDirUnix() {
    const root = Deno.env.get("HOME");
    if (!root) {
        throw new Error("`HOME` environment variable is not defined.");
    }
    return mod2.join(root, ".cache", "denops_std", "load");
}
function getCacheDirWindows() {
    const root = Deno.env.get("LOCALAPPDATA");
    if (!root) {
        throw new Error("`LOCALAPPDATA` environment variable is not defined.");
    }
    return mod2.join(root, "denops_std", "load");
}
async function bufadd(denops1, name2) {
    const bufnr = await denops1.call("bufadd", name2);
    return bufnr;
}
async function bufexists(denops1, name2) {
    const result = await denops1.call("bufexists", name2);
    return !!result;
}
async function buflisted(denops1, name2) {
    const result = await denops1.call("buflisted", name2);
    return !!result;
}
async function bufload(denops1, name2) {
    await denops1.call("bufload", name2);
}
async function bufloaded(denops1, name2) {
    const result = await denops1.call("bufloaded", name2);
    return !!result;
}
async function bufname(denops1, name2) {
    return await denops1.call("bufname", name2);
}
async function bufnr(denops1, name2) {
    return await denops1.call("bufnr", name2);
}
async function bufwinid(denops1, name2) {
    return await denops1.call("bufwinid", name2);
}
async function bufwinnr(denops1, name2) {
    return await denops1.call("bufwinnr", name2);
}
async function getbufline(denops1, name2, lnum, end) {
    if (end) {
        return await denops1.call("getbufline", name2, lnum, end);
    }
    return await denops1.call("getbufline", name2, lnum);
}
async function getline(denops1, lnum, end) {
    if (end) {
        return await denops1.call("getline", lnum, end);
    }
    return await denops1.call("getline", lnum);
}
async function has(denops1, name2) {
    const result = await denops1.call("has", name2);
    return !!result;
}
class FunctionHelper {
    #denops;
    constructor(denops1){
        this.#denops = denops1;
    }
    async bufadd(name) {
        return await bufadd(this.#denops, name);
    }
    async bufexists(name) {
        return await bufexists(this.#denops, name);
    }
    async buflisted(name) {
        return await buflisted(this.#denops, name);
    }
    async bufload(name) {
        await bufload(this.#denops, name);
    }
    async bufloaded(name) {
        return await bufloaded(this.#denops, name);
    }
    async bufname(name) {
        return await bufname(this.#denops, name);
    }
    async bufnr(name) {
        return await bufnr(this.#denops, name);
    }
    async bufwinid(name) {
        return await bufwinid(this.#denops, name);
    }
    async bufwinnr(name) {
        return await bufwinnr(this.#denops, name);
    }
    async exists(name) {
        return await has(this.#denops, name);
    }
    async getbufline(name, lnum, end) {
        return await getbufline(this.#denops, name, lnum, end);
    }
    async getline(lnum, end) {
        return await getline(this.#denops, lnum, end);
    }
    async has(name) {
        return await has(this.#denops, name);
    }
}
class Vim {
    static instance;
    #denops;
    g;
    b;
    w;
    t;
    v;
    fn;
    constructor(denops2){
        this.#denops = denops2;
        this.g = new VariableHelper(denops2, "g");
        this.b = new VariableHelper(denops2, "b");
        this.w = new VariableHelper(denops2, "w");
        this.t = new VariableHelper(denops2, "t");
        this.v = new VariableHelper(denops2, "v");
        this.fn = new FunctionHelper(denops2);
    }
    static get() {
        if (!Vim.instance) {
            Vim.instance = new Vim(Denops.get());
        }
        return Vim.instance;
    }
    get name() {
        return this.#denops.name;
    }
    async call(func, ...args) {
        return await this.#denops.call(func, ...args);
    }
    async cmd(cmd, ctx = {
    }) {
        await this.#denops.cmd(cmd, ctx);
    }
    async eval(expr, ctx = {
    }) {
        return await this.#denops.eval(expr, ctx);
    }
    async execute(script, ctx = {
    }) {
        await execute(this.#denops, script, ctx);
    }
    async autocmd(group, main) {
        await autocmd(this.#denops, group, main);
    }
    async load(url) {
        await load1(this.#denops, url);
    }
    register(dispatcher) {
        this.#denops.extendDispatcher(dispatcher);
    }
}
function main(runner) {
    Denops.start(async (denops3)=>{
        const vim = Vim.get();
        const ctx = {
            denops: denops3,
            vim
        };
        await runner(ctx);
    });
}
main(async ({ vim  })=>{
    vim.register({
        async say (where) {
            ensureString(where, "where");
            const name2 = await vim.call("input", "Your name: ");
            const progname = await vim.eval("v:progname");
            const messages = [
                `Hello ${where}`,
                `Your name is ${name2}`,
                `This is ${progname}`, 
            ];
            await vim.cmd(`redraw | echomsg message`, {
                message: messages.join(". ")
            });
        },
        async get_variables () {
            console.log("g:denops_helloworld", await vim.g.get("denops_helloworld"));
            console.log("b:denops_helloworld", await vim.b.get("denops_helloworld"));
            console.log("w:denops_helloworld", await vim.w.get("denops_helloworld"));
            console.log("t:denops_helloworld", await vim.t.get("denops_helloworld"));
            console.log("v:errmsg", await vim.v.get("errmsg"));
        },
        async set_variables () {
            await vim.g.set("denops_helloworld", "Global HOGEHOGE");
            await vim.b.set("denops_helloworld", "Buffer HOGEHOGE");
            await vim.w.set("denops_helloworld", "Window HOGEHOGE");
            await vim.t.set("denops_helloworld", "Tabpage HOGEHOGE");
            await vim.v.set("errmsg", "Vim HOGEHOGE");
        },
        async remove_variables () {
            await vim.g.remove("denops_helloworld");
            await vim.b.remove("denops_helloworld");
            await vim.w.remove("denops_helloworld");
            await vim.t.remove("denops_helloworld");
            await vim.v.remove("errmsg");
        },
        async register_autocmd () {
            await vim.cmd("new");
            await vim.autocmd("denops_helloworld", (helper)=>{
                helper.remove("*", "<buffer>");
                helper.define("CursorHold", "<buffer>", "echomsg 'Hello Denops CursorHold'");
                helper.define([
                    "BufEnter",
                    "BufLeave"
                ], "<buffer>", "echomsg 'Hello Denops BufEnter/BufLeave'");
            });
        }
    });
    await vim.execute(`\n    command! HelloWorld call denops#notify("${vim.name}", "say", ["World"])\n    command! HelloDenops call denops#notify("${vim.name}", "say", ["Denops"])\n  `);
    console.log("denops-helloworld.vim (std) has loaded");
});

