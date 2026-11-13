export type HttpMethod='GET'|'POST'|'PUT'|'PATCH'|'DELETE';
export type HttpPrimitive='string'|'number'|'boolean';
export interface HttpRecordSchema {readonly fields:Readonly<Record<string,HttpPrimitive>>}
export type HttpResponseSchema=HttpPrimitive|HttpRecordSchema|{readonly list:HttpPrimitive|HttpRecordSchema};
export interface HttpRequest {
  method:HttpMethod;url:string;headers:Headers;body?:unknown;signal?:AbortSignal;response?:HttpResponseSchema;
}
export interface HttpOptions {headers?:HeadersInit;params?:Readonly<Record<string,string|number|boolean>>;body?:unknown;signal?:AbortSignal;response?:HttpResponseSchema;client?:string}
export type HttpRequestInterceptor=(request:HttpRequest)=>HttpRequest|void|Promise<HttpRequest|void>;
export type HttpResponseInterceptor=(value:unknown,response:Response,request:HttpRequest)=>unknown|Promise<unknown>;
export type HttpErrorInterceptor=(error:unknown,request:HttpRequest)=>unknown|Promise<unknown>;
export interface HttpClientConfig {
  base?:string;auth?:()=>string|null|undefined|Promise<string|null|undefined>;
  request?:readonly HttpRequestInterceptor[];response?:readonly HttpResponseInterceptor[];error?:readonly HttpErrorInterceptor[];
}
export interface HttpEnvironment {fetch?:typeof fetch;clients?:Readonly<Record<string,HttpClientConfig>>;defaultClient?:string;maxResponseItems?:number;maxResponseDepth?:number}

export {createHttp,http,HttpError} from './index.js';
