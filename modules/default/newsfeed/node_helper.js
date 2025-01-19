const NodeHelper = require("node_helper");
const Log = require("logger");
const NewsfeedFetcher = require("./newsfeedfetcher");

module.exports = NodeHelper.create({
    // Override start method.
    start() {
        Log.log(`Starting node helper for: ${this.name}`);
        this.fetchers = {}; // Use an object to store fetchers by URL
    },

    // Override socketNotificationReceived.
    socketNotificationReceived(notification, payload) {
        if (notification === "ADD_FEED") {
            this.createFetcher(payload.feed, payload.config);
        }
    },

    /**
     * Creates a fetcher for a new feed if it doesn't exist yet.
     * Otherwise, it reuses the existing one.
     * @param {object} feed The feed object
     * @param {object} config The configuration object
     */
    createFetcher(feed, config) {
        const url = feed.url || "";
        const encoding = feed.encoding || "UTF-8";
        const reloadInterval = feed.reloadInterval || config.reloadInterval || 5 * 60 * 1000;

        if (!url) {
            Log.error("Newsfeed Error: No URL provided.");
            this.sendSocketNotification("NEWSFEED_ERROR", { error_type: "MODULE_ERROR_NO_URL" });
            return;
        }

        try {
            new URL(url); // Validate URL format
        } catch (error) {
            Log.error("Newsfeed Error. Malformed newsfeed URL:", url, error);
            this.sendSocketNotification("NEWSFEED_ERROR", { error_type: "MODULE_ERROR_MALFORMED_URL" });
            return;
        }

        if (!this.fetchers[url]) {
            Log.log(`Creating new fetcher for URL: ${url} - Interval: ${reloadInterval}`);

            const fetcher = new NewsfeedFetcher(url, reloadInterval, encoding, config.logFeedWarnings, feed.useCorsProxy);

            fetcher.onReceive((items) => {
                Log.info(`Fetcher received ${items.length} items from ${url}`);
                this.broadcastFeeds();
            });

            fetcher.onError((fetcherInstance, error) => {
                Log.error("Newsfeed Error: Could not fetch newsfeed:", url, error);
                const errorType = NodeHelper.checkFetchError(error);
                this.sendSocketNotification("NEWSFEED_ERROR", { error_type: errorType });
            });

            this.fetchers[url] = fetcher;
            fetcher.startFetch();
        } else {
            Log.log(`Using existing fetcher for URL: ${url}`);
            const fetcher = this.fetchers[url];
            fetcher.setReloadInterval(reloadInterval);
            fetcher.broadcastItems();
        }
    },

    /**
     * Broadcasts all feed items from all fetchers.
     */
	broadcastFeeds() {
		console.log("Broadcasting feeds...");
		for (const f in this.fetchers) {
			const fetcher = this.fetchers[f];
			if (fetcher && fetcher.items) {
				console.log(`Fetcher items for ${f}:`, fetcher.items); // Add this
				console.log(`Broadcasting ${fetcher.items.length} items from ${f}`);
				this.sendSocketNotification("NEWS_ITEMS", fetcher.items);
			} else {
				console.log("Fetcher not initialized or has no items for:", f);
				this.sendSocketNotification("NEWSFEED_ERROR", {
					error_type: "FETCHER_NOT_INITIALIZED"
				});
			}
		}
	}
	
		
	
});
