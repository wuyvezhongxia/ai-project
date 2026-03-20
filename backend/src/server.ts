import { env } from "./config/env";
import { app } from "./app";

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`PM backend listening on http://localhost:${env.PORT}`);
});
