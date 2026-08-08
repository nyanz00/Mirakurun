import { Operation } from "express-openapi";
import * as apid from "../../../../../../../api";
export declare const parameters: ({
    in: string;
    name: string;
    type: string;
    enum: apid.ChannelType[];
    required: boolean;
    maximum?: undefined;
} | {
    in: string;
    name: string;
    type: string;
    required: boolean;
    enum?: undefined;
    maximum?: undefined;
} | {
    in: string;
    name: string;
    type: string;
    maximum: number;
    required: boolean;
    enum?: undefined;
})[];
export declare const get: Operation;
