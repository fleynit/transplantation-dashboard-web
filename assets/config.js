/* 前端配置（公有仓库，安全：仅含 API 基地址，绝不内含任何令牌或数据）。
 *
 * API_BASE 指向私有数据层经隧道暴露的公网地址（固定子域名，需在
 * https://console.serveo.net/ 用 GitHub 登录并登记本机 SSH 公钥后注册）。
 * 启动私有端 deploy/start.bat 时，TUNNEL_NAME 须与此处一致，隧道才会
 * 绑定到该固定地址。
 * 浏览器端仍支持两种临时覆盖（便于本地调试，不提交仓库）：
 *   - URL 参数： index.html?api=http://127.0.0.1:8000
 *   - localStorage： 键名 "transplant_dashboard_api_base"
 * Bearer 令牌由用户在页面输入后保存在 localStorage（键名见 TOKEN_KEY），不上线、不入库。
 */
window.DASH_CONFIG = {
  API_BASE: "https://fleynit-transplant.serveo.net",
  TOKEN_KEY: "transplant_dashboard_token",
  API_BASE_KEY: "transplant_dashboard_api_base"
};
