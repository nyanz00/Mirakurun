import { Writable } from "stream";
import * as common from "./common";
import * as apid from "../../api";
import TunerDevice, { TunerDeviceStatus } from "./TunerDevice";
import ChannelItem from "./ChannelItem";
import ServiceItem from "./ServiceItem";
import TSFilter from "./TSFilter";
export declare class Tuner {
    private _devices;
    private _readyForJobPickedDeviceSet;
    constructor();
    get devices(): TunerDeviceStatus[];
    get(index: number): TunerDevice;
    readyForJob(channel: ChannelItem): Promise<boolean>;
    typeExists(type: apid.ChannelType): boolean;
    getRemoteDeviceByChannel(channel: ChannelItem): TunerDevice | null;
    hasRemoteLogoData(service: ServiceItem): Promise<boolean>;
    initChannelStream(channel: ChannelItem, userReq: common.UserRequest, output: Writable): Promise<TSFilter>;
    initServiceStream(service: ServiceItem, userReq: common.UserRequest, output: Writable): Promise<TSFilter>;
    initProgramStream(program: apid.Program, userReq: common.UserRequest, output: Writable): Promise<TSFilter>;
    getEPG(channel: ChannelItem, time?: number): Promise<void>;
    getServices(channel: ChannelItem, user?: Partial<common.User>): Promise<apid.Service[]>;
    private _load;
    private _initTS;
    private _useRemoteData;
    private _pickTunerDevice;
    private _getDevicesByType;
}
export default Tuner;
