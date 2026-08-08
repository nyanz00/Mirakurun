import * as stream from "stream";
interface StreamOptions extends stream.TransformOptions {
    readonly output: stream.Writable;
    readonly command: string;
}
export default class TSDecoder extends stream.Writable {
    private static readonly PROCESSING_LOG_PATTERN;
    private _output;
    private _id;
    private _command;
    private _process;
    private _readable;
    private _writable;
    private _isNew;
    private _timeout;
    private _closed;
    private _deadCount;
    constructor(opts: StreamOptions);
    _write(chunk: Buffer, encoding: string, callback: Function): void;
    _final(): void;
    private _spawn;
    private _handleStderr;
    private _dead;
    private _fallback;
    private _kill;
    private _close;
}
export {};
