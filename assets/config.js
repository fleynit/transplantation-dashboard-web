/* 前端配置（公有仓库，安全：仅含 API 基地址，绝不内含任何令牌或数据）。
 *
 * 部署前请将 API_BASE 改为你的私有 API 服务域名，例如：
 *   https://api.your-domain.com
 * 或通过 Cloudflare Tunnel 暴露的地址。
 * 浏览器端还支持两种临时覆盖（便于本地调试，不会提交到仓库）：
 *   - URL 参数： index.html?api=http://127.0.0.1:8000
 *   - localStorage： 键名 "transplant_dashboard_api_base"
 * Bearer 令牌由用户在页面输入后保存在 localStorage（键名见 TOKEN_KEY），不上线、不入库。
 */
window.DASH_CONFIG = {
  API_BASE: "https://api.your-private-domain.example",
  TOKEN_KEY: "transplant_dashboard_token",
  API_BASE_KEY: "transplant_dashboard_api_base"
};
