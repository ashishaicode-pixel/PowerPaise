import { createBrowserRouter } from "react-router";
import { Dashboard } from "./screens/Dashboard";
import { AITips } from "./screens/AITips";
import { Community } from "./screens/Community";
import { MonthlyReport } from "./screens/MonthlyReport";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Dashboard,
  },
  {
    path: "/ai-tips",
    Component: AITips,
  },
  {
    path: "/community",
    Component: Community,
  },
  {
    path: "/report",
    Component: MonthlyReport,
  },
]);
