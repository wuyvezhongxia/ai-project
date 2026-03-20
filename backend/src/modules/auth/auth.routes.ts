import { Router } from "express";

import { asyncHandler } from "../../common/http";
import { checkToken, getContext } from "./auth.controller";

const router = Router();

router.get("/context", asyncHandler(getContext));
router.get("/check", asyncHandler(checkToken));

export const authRouter = router;
