import { ApiError } from "./respond";
import { isSameOrigin } from "./origin";
export function assertSameOrigin(request:Request):void{
  if(!isSameOrigin(request))throw new ApiError("Cross-origin request rejected",403);
}
