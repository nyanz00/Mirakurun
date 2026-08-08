import * as apid from "../../api";
interface Service extends apid.Service {
    logoData?: string;
}
export interface Program extends apid.Program {
    _pf?: true;
    _isPresent?: true;
    _isFollowing?: true;
}
export declare function loadServices(integrity: string, sync?: boolean): Promise<Service[]>;
export declare function saveServices(data: Service[], integrity: string): Promise<void>;
export declare function loadPrograms(integrity: string, sync?: boolean): Promise<Program[]>;
export declare function savePrograms(data: Program[], integrity: string): Promise<void>;
export {};
