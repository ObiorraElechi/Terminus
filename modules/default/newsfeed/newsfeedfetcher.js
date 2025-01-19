const crypto = require("node:crypto");
const stream = require("node:stream");
const FeedMe = require("feedme");
const iconv = require("iconv-lite");
const { htmlToText } = require("html-to-text");
const Log = require("logger");
const NodeHelper = require("node_helper");

const NewsfeedFetcher = function (url, reloadInterval, encoding, logFeedWarnings, useCorsProxy) {
    let reloadTimer = null;
    let items = [];
    let reloadIntervalMS = Math.max(reloadInterval, 1000); // Ensure minimum interval of 1 second

    let fetchFailedCallback = function () {};
    let itemsReceivedCallback = function () {};

    const fetchNews = () => {
        console.log("Starting fetch...");
        this.items = []; // Clear items before fetching

       
        Log.info(`Fetching news from ${url}`);
        const parser = new FeedMe();

        parser.on("item", (item) => {
            console.log("Fetched item:", item.title);
            this.items.push({
                title: item.title || "No Title",
                description: item.description || "No Description",
                pubdate: item.pubdate || new Date().toISOString(),
                url: item.link || "No URL",
            });
        });
    
        parser.on("end", () => {
            console.log(`Finished fetching. Total items: ${this.items.length}`);
            this.broadcastItems(); // This should trigger node helper updates
        });

        parser.on("error", (error) => {
            Log.error("Error fetching news:", error);
        });

        const headers = {
            "User-Agent": `Mozilla/5.0 (Node.js ${process.version}) MagicMirror`,
            "Cache-Control": "max-age=0, no-cache, no-store, must-revalidate",
            Pragma: "no-cache"
        };

        fetch(url, { headers })
            .then(NodeHelper.checkFetchStatus)
            .then((response) => {
                if (!response.body) {
                    throw new Error("Response body is undefined or null.");
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder(encoding || "utf-8");
                let data = "";

                const processChunk = ({ done, value }) => {
                    if (done) {
                        const stream = iconv.decode(Buffer.from(data), encoding || "utf-8");
                        parser.write(stream);
                        parser.end();
                        return;
                    }
                    data += decoder.decode(value, { stream: true });
                    return reader.read().then(processChunk);
                };

                return reader.read().then(processChunk);
            })
            .catch((error) => {
                Log.error(`Failed to fetch news from ${url}:`, error);
                fetchFailedCallback(this, error);
                scheduleTimer();
            });
    };

    const scheduleTimer = () => {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(fetchNews, reloadIntervalMS);
    };

    this.setReloadInterval = (interval) => {
        if (interval >= 1000) reloadIntervalMS = interval;
    };

    this.startFetch = fetchNews.bind(this);

    this.broadcastItems = () => {
        if (this.items.length > 0) {
            console.log(`Broadcasting items:`, this.items); // Log items
            itemsReceivedCallback(this.items); // Ensure this callback is invoked
        } else {
            console.warn("No items to broadcast.");
        }
    };
    

    this.onReceive = (callback) => {
        itemsReceivedCallback = callback;
    };

    this.onError = (callback) => {
        fetchFailedCallback = callback;
    };

    this.items = function () {
        return items; // Access the internal `items` array
    };
    
};

module.exports = NewsfeedFetcher;
