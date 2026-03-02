import { AuthApi } from "@healops/api-sdk/src/apis/AuthApi";
import { Configuration } from "@healops/api-sdk/src/runtime";


const BASE_PATH = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";

 const baseConfig = new Configuration({
  basePath: BASE_PATH,
  credentials: "include",
});

export const authApi = new AuthApi(baseConfig);
