interface Status {
    epg: {
        [networkId: number]: boolean;
    };
    rpcCount: number;
    streamCount: {
        tsFilter: number;
        decoder: number;
    };
    errorCount: {
        uncaughtException: number;
        unhandledRejection: number;
        bufferOverflow: number;
        tunerDeviceRespawn: number;
        decoderRespawn: number;
    };
    timerAccuracy: {
        last: number;
        m1: number[];
        m5: number[];
        m15: number[];
    };
}
declare const status: Status;
export default status;
