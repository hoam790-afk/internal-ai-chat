import rateLimit from "express-rate-limit";

export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Bạn đang gửi hơi nhanh. Vui lòng chờ một chút rồi thử lại."
  }
});
