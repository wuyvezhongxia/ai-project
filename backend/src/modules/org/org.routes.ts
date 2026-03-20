import { Router } from "express";

import { asyncHandler } from "../../common/http";
import { getCurrentTenant, getDeptTree, getUserDetail, getUserOptions } from "./org.controller";

const router = Router();

router.get("/users/options", asyncHandler(getUserOptions));
router.get("/depts/tree", asyncHandler(getDeptTree));
router.get("/users/:id", asyncHandler(getUserDetail));
router.get("/tenants/current", asyncHandler(getCurrentTenant));

export const orgRouter = router;
