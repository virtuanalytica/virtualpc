import { Request, Response, NextFunction } from 'express';
export declare const securityHeaders: (req: Request, res: Response, next: NextFunction) => void;
export declare const corsHeaders: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
declare const _default: {
    securityHeaders: (req: Request, res: Response, next: NextFunction) => void;
    corsHeaders: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
};
export default _default;
//# sourceMappingURL=securityHeaders.d.ts.map