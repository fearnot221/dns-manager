export interface MockPermission { id:string; userId:string; user:{name:string;email:string;image:null}; role:"VIEWER"|"EDITOR"|"ADMIN"; expiresAt:string|null }
export const mockPermissions:MockPermission[]=[
  {id:"p1",userId:"alice",user:{name:"Alice Lin",email:"alice@example.com",image:null},role:"EDITOR",expiresAt:null},
  {id:"p2",userId:"bob",user:{name:"Bob Chen",email:"bob@example.com",image:null},role:"VIEWER",expiresAt:null},
];
