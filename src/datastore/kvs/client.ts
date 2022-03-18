import {KeyValueStore, genericList} from '.';
import * as Proto from './proto';
import * as NanoService from '../../util/nanoservice';
import event, {Event} from '../../util/event';

export default class Client<K extends Proto.Key, V extends Proto.Value>
    implements KeyValueStore<K, V>
{
    readonly name: string;
    readonly connect: (name: string) => Proto.ServicePort<K, V>;

    readonly onSet: Event<(entries: Proto.Entry<K, V>[]) => void>;
    readonly onDelete: Event<(keys: K[]) => void>;
    readonly onSyncLost: Event<() => void>;

    private _port: Proto.ServicePort<K, V>;

    constructor(
        service_name: string,
        connector?: (name: string) => Proto.ServicePort<K, V>)
    {
        this.name = service_name;
        // istanbul ignore next -- we always pass `connector` for tests
        this.connect = connector ?? NanoService.connect;

        this.onSet = event('KVS.Client.onSet', this.name);
        this.onDelete = event('KVS.Client.onDelete', this.name);
        this.onSyncLost = event('KVS.Client.onSyncLost', this.name);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this._port = undefined!; // !-cast - we properly-assign it below.
        this._reconnect();
    }

    async get(keys: K[]): Promise<Proto.Entry<K, V>[]> {
        const resp = await this._request_with_retry({$type: 'get', keys});
        // istanbul ignore next
        if (resp?.$type !== 'set') return [];
        return resp.entries;
    }

    async getStartingFrom(
        bound: K | undefined, limit: number
    ): Promise<Proto.Entry<K, V>[]> {
        const resp = await this._request_with_retry({
            $type: 'getStartingFrom', bound, limit});
        // istanbul ignore next
        if (resp?.$type !== 'set') return [];
        return resp.entries;
    }

    async getEndingAt(
        bound: K | undefined, limit: number
    ): Promise<Proto.Entry<K, V>[]> {
        const resp = await this._request_with_retry({
            $type: 'getEndingAt', bound, limit});
        // istanbul ignore next
        if (resp?.$type !== 'set') return [];
        return resp.entries;
    }

    list(): AsyncIterable<Proto.Entry<K, V>> {
        return genericList((bound, limit) => this.getStartingFrom(bound, limit));
    }

    listReverse(): AsyncIterable<Proto.Entry<K, V>> {
        return genericList((bound, limit) => this.getEndingAt(bound, limit));
    }

    async set(entries: Proto.Entry<K, V>[]): Promise<void> {
        await this._request_with_retry({$type: 'set', entries: entries});
    }

    async delete(keys: K[]): Promise<void> {
        await this._request_with_retry({$type: 'delete', keys});
    }

    async deleteAll(): Promise<void> {
        await this._request_with_retry({$type: 'deleteAll'});
    }

    private _reconnect() {
        this._port = this.connect(this.name);
        this._port.onNotify = msg => {
            /* istanbul ignore next */ if (! msg) return;
            switch (msg.$type) {
                case 'delete':
                    this.onDelete.send(msg.keys);
                    break;
                case 'set':
                    this.onSet.send(msg.entries);
                    break;
            }
        };
        this._port.onDisconnect = () => {
            this._reconnect();
            this.onSyncLost.send();
        };
    }

    private async _request_with_retry(msg: Proto.ClientMsg<K, V>): Promise<Proto.ServiceMsg<K, V>> {
        let retries = 10;
        for (; ;) {
            try {
                return await this._port.request(msg);
            } catch (e) {
                if (! (e instanceof NanoService.NanoPortError)) throw e;
                if (retries <= 0) throw e;

                await new Promise(r => setTimeout(r, (10 - retries) * 100));
                --retries;
                // We should receive an onDisconnect or similar event from the
                // port which will cause us to reconnect, if necessary.  We
                // don't explicitly reconnect here because it may just be that
                // things are delayed (rather than lost), in which case,
                // disconnecting might cause us to miss notifications from the
                // service (i.e. we would be forced to trigger onSyncLost, which
                // might be expensive).
            }
        }
    }
}
