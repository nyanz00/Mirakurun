import { Operation } from "express-openapi";
export declare const parameters: ({
    in: string;
    name: string;
    type: string;
    minimum: number;
    maximum: number;
    required: boolean;
} | {
    in: string;
    name: string;
    type: string;
    minimum: number;
    maximum?: undefined;
    required?: undefined;
} | {
    in: string;
    name: string;
    type: string;
    minimum: number;
    maximum: number;
    required?: undefined;
})[];
export declare const get: Operation;
export declare const head: Operation;
