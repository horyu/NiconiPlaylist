import { browser } from "wxt/browser";

import {
  hasNvapiClientMarker,
  NVAPI_VIDEOS_URL_MATCH_PATTERN,
  NVAPI_VIDEOS_URL_REGEX_FILTER,
} from "@/background/services/nvapi";

const USER_AGENT_RULE_ID = 1_001;
const USER_AGENT_VALUE = "NiconiPlaylist (+https://github.com/horyu/NiconiPlaylist)";

let isUserAgentOverrideInitialized = false;

async function configureDeclarativeNetRequestUserAgent(): Promise<void> {
  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [USER_AGENT_RULE_ID],
    addRules: [
      {
        id: USER_AGENT_RULE_ID,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            {
              header: "User-Agent",
              operation: "set",
              value: USER_AGENT_VALUE,
            },
          ],
        },
        condition: {
          regexFilter: NVAPI_VIDEOS_URL_REGEX_FILTER,
          resourceTypes: ["xmlhttprequest"],
        },
      },
    ],
  });
}

function configureFirefoxWebRequestUserAgent(): void {
  const handler: Parameters<typeof browser.webRequest.onBeforeSendHeaders.addListener>[0] = (
    details,
  ) => {
    if (!hasNvapiClientMarker(details.url)) {
      return undefined;
    }

    const nextRequestHeaders = (details.requestHeaders ?? []).filter((header) => {
      return header.name?.toLowerCase() !== "user-agent";
    });

    nextRequestHeaders.push({
      name: "User-Agent",
      value: USER_AGENT_VALUE,
    });

    return {
      requestHeaders: nextRequestHeaders,
    };
  };

  browser.webRequest.onBeforeSendHeaders.addListener(
    handler,
    {
      urls: [NVAPI_VIDEOS_URL_MATCH_PATTERN],
    },
    ["blocking", "requestHeaders"],
  );
}

export async function initUserAgentOverride(): Promise<void> {
  if (isUserAgentOverrideInitialized) {
    return;
  }

  isUserAgentOverrideInitialized = true;

  if (import.meta.env.FIREFOX) {
    configureFirefoxWebRequestUserAgent();
    return;
  }

  if (browser.declarativeNetRequest) {
    await configureDeclarativeNetRequestUserAgent();
    return;
  }

  console.warn("NiconiPlaylist could not initialize User-Agent override.");
}
