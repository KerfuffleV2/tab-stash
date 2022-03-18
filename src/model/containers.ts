import {reactive} from "vue";
import {contextualIdentities, ContextualIdentities} from 'webextension-polyfill';
import {backingOff} from "../util";
import {logErrorsFrom} from "../util/oops";
import {EventWiring} from "../util/wiring";

export type Container = ContextualIdentities.ContextualIdentity;

type ContainerMap = Map<string, Container>;

export class Model {
    private containers: ContainerMap = new Map;
    enabled: boolean;

    // Did we receive an event since the last (re)load of the model?
    private _event_since_load = false;

    constructor() {
        const supports_containers = [
            typeof contextualIdentities?.query,
            typeof contextualIdentities?.onCreated?.addListener,
            typeof contextualIdentities?.onUpdated?.addListener,
            typeof contextualIdentities?.onRemoved?.addListener]
            .every(v => v === 'function');
        if (!supports_containers) {
            // Avoid blowing up if running on a browser with no container support.
            this.enabled = false;
            return;
        }

        this.enabled = true;
        const wiring = new EventWiring(this, {
            onFired: () => {this._event_since_load = true;},
            // istanbul ignore next -- safety net; reload the model in the event
            // of an unexpected exception.
            onError: () => {void logErrorsFrom(() => this.reload());},
        });

        wiring.listen(contextualIdentities.onCreated, this.whenChanged.bind(this));
        wiring.listen(contextualIdentities.onUpdated, this.whenChanged.bind(this));
        wiring.listen(contextualIdentities.onRemoved, this.whenRemoved.bind(this));
    }

    static async from_browser(): Promise<Model> {
        const model = new Model();
        await model.reload();
        return model;
    }

    // Fetch containers from the browser again and update the model's
    // understanding of the world with the browser's data.  Use this if it looks
    // like the model has gotten out of sync with the browser (e.g. for crash
    // recovery).
    readonly reload = backingOff(async () => {
        if (!this.enabled) return;
        // We loop until we can complete a reload without receiving any
        // concurrent events from the browser--if we get a concurrent event, we
        // need to try loading again, since we don't know how the event was
        // ordered with respect to the query().
        let loaded_containers: Container[];

        this._event_since_load = true;
        while (this._event_since_load) {
            this._event_since_load = false;
            try {
                loaded_containers = await contextualIdentities.query({});
            } catch (e) {
                // Containers can be manually disabled in Firefox by setting
                // privacy.userContext.enabled to false. When this is the case,
                // calling .query() will raise an exception.
                this.enabled = false;
                loaded_containers = [];
                break;
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.containers = new Map(loaded_containers!
            .filter(c => c?.cookieStoreId)
            .map(c => [c.cookieStoreId, this.makeContainerReactive(c)]));
    });

    private makeContainerReactive(c: Container): Container {
        return reactive({
            name: c.name,
            icon: c.icon,
            iconUrl: c.iconUrl,
            color: c.color,
            colorCode: c.colorCode,
            cookieStoreId: c.cookieStoreId
        });
    }

    // Accessors
    container(key: string): Container | undefined {
        return this.containers.get(key);
    }

    // Event handlers
    private whenChanged(evt:
        ContextualIdentities.OnCreatedChangeInfoType |
        ContextualIdentities.OnUpdatedChangeInfoType) {

        const container = evt.contextualIdentity;
        const key = container.cookieStoreId;
        let c = this.containers.get(key);
        if (!c) {
            this.containers.set(key, this.makeContainerReactive(container));
            return;
        }
        c.name = container.name;
        c.icon = container.icon;
        c.iconUrl = container.iconUrl;
        c.color = container.color;
        c.colorCode = container.colorCode;
        c.cookieStoreId = container.cookieStoreId;
    }

    private whenRemoved(evt: ContextualIdentities.OnRemovedChangeInfoType) {
        const key = evt.contextualIdentity.cookieStoreId;
        this.containers.delete(key);
    }
}
