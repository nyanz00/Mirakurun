import { Operation } from "express-openapi";
import * as apid from "../../../../../../../../api";
export declare const parameters: ({
    in: string;
    name: string;
    type: string;
    enum: apid.ChannelType[];
    required: boolean;
    maximum?: undefined;
    minimum?: undefined;
} | {
    in: string;
    name: string;
    type: string;
    required: boolean;
    enum?: undefined;
    maximum?: undefined;
    minimum?: undefined;
} | {
    in: string;
    name: string;
    type: string;
    maximum: number;
    required: boolean;
    enum?: undefined;
    minimum?: undefined;
} | {
    in: string;
    name: string;
    type: string;
    minimum: number;
    enum?: undefined;
    required?: undefined;
    maximum?: undefined;
} | {
    in: string;
    name: string;
    type: string;
    minimum: number;
    maximum: number;
    enum?: undefined;
    required?: undefined;
})[];
export declare const get: Operation;
export declare const head: Operation;
