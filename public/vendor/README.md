# ThinkingData client-message SDKs

`tdremoteconfig-1.3.0.umd.min.js` and `tdstrategy-1.3.0.umd.min.js` are unmodified files from the [official Web Strategy v1.3.0 release](https://download.thinkingdata.cn/client/MPMG/web_td_strategy_v1.3.0.zip), following the [JavaScript integration guide](https://docs.thinkingai.io/ja/integration/js_td_sdk).

The application initializes the existing `thinkingdata-browser@2.5.0` instance first, then loads Remote Config and Strategy in order. Both use that instance's browser identity, authentication and event stream. `triggerListener` forwards `content.inAppMessage` to the separately installed `td-content-ui-js` renderer.
