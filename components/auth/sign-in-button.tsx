"use client";
import { signIn } from "next-auth/react";
export function SignInButton(){return <button className="google-button" onClick={()=>signIn("google",{callbackUrl:"/requests"})}><span className="google-g">G</span>使用 Google 帳號登入</button>}
