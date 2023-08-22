export interface OnebotMap {
    app: string;
    config: {
        autosize: boolean;
        ctime: number;
        forward: boolean;
        token: string;
        type: string;
    };
    desc: string;
    from: number;
    meta: {
        "Location.Search": {
            address: string;
            enum_relation_type: number;
            from: string;
            from_account: number;
            id: string;
            lat: string;
            lng: string;
            name: string;
            uint64_peer_account: number;
        }
    };
    prompt: string;
    ver: string;
    view: string;
}