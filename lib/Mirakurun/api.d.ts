import * as express from "express";
export interface Error {
    readonly code: number;
    readonly reason: string;
    readonly errors: any[];
}
export declare function responseError(res: express.Response, code: number, reason?: string): express.Response;
export declare function responseStreamErrorHandler(res: express.Response, err: NodeJS.ErrnoException): express.Response;
export declare function responseJSON(res: express.Response, body: any): Promise<express.Response>;
