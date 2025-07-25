import express from "express";
import cloudinary from "../lib/cloudinary.js";
import Comment from "../models/comment.js";
import Book from "../models/book.js";
import Genre from "../models/genre.js";
import protectRoute from "../middleware/auth.middleware.js";
import mongoose from "mongoose"; // Import mongoose here
import { createAndSendNotification } from "../lib/notificationHelper.js";

const router = express.Router();

// Before async to send POST --> Call protectRoute to check Token.
router.post("/", protectRoute, async (req, res) => {
  try {
    const { title, caption, rating, image, author, published_year, genre } =
      req.body;

    if (!title || !caption || !rating || !image || !author || !genre) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Upload image to Cloudinary
    const uploadResponse = await cloudinary.uploader.upload(image, {
      folder: "Book_Forum/Book_Review",
    });

    // Link Upload to Cloudinary
    const imageUrl = uploadResponse.secure_url;

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating out of scope" });
    }

    if (genre) {
      // Check if genre is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(genre)) {
        return res.status(400).json({ message: "Invalid genre ID format" });
      }
      const genreExists = await Genre.findById(genre);
      if (!genreExists || genreExists.is_deleted) {
        return res.status(400).json({ message: "Invalid or deleted genre" });
      }
    }

    // check valid year
    // published year -> check dieu kien field nay co trong req - vi day la optional, isNaN - is not a number --> tra ve true neu la text
    if (
      published_year &&
      (isNaN(published_year) ||
        published_year < 0 ||
        published_year > new Date().getFullYear())
    ) {
      return res.status(400).json({ message: "Invalid published year" });
    }

    const newBook = new Book({
      title,
      caption,
      rating,
      image: imageUrl,
      user: req.user._id, // Cần Token để xác định danh tính người gửi
      author,
      published_year: published_year || undefined, // Optional field
      genre,
      process: "pending", // Default o trang thai pending
      is_deleted: false, // Default khong xoa sach
    });

    await newBook.save(); //build function của  Mongoose - store data

    // Emit to admin clients khi có sách mới
    if (req.emitToAdmins) {
      req.emitToAdmins("newBook", {
        book: newBook,
        user: req.user,
      });
    }

    // Emit cho tất cả client FE (user app) để tự động reload
    if (req.io) {
      req.io.emit("newBookCreated", {
        book: newBook,
        user: req.user,
      });
    }

    res.status(201).json(newBook);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET genre cho User
router.get("/genres", async (req, res) => {
  try {
    const genres = await Genre.find({ soft_delete: false }) // neu chua xoa mem thi get
      .select("genre_name _id") // select ten va id tu mongo
      .sort({ genre_name: 1 }); // Sort alphabetically

    if (!genres || genres.length === 0) {
      return res.status(404).json({ message: "No genres found" });
    }

    res.status(200).json(genres);
  } catch (error) {
    console.error("Error fetching genres:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Internal server error" });
  }
});

// Pagination cho trang home - phân trang --> danh cho da la user
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Add filter for user if provided
    const matchFilter = req.query.user
      ? { user: new mongoose.Types.ObjectId(req.query.user) }
      : {};

    // Sử dụng aggregate để loại bỏ books có user null
    const books = await Book.aggregate([
      { $match: matchFilter },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $match: {
          "user.0": { $exists: true }, // Chỉ lấy books có user tồn tại
        },
      },
      {
        $unwind: "$user",
      },
      {
        $project: {
          title: 1,
          caption: 1,
          image: 1,
          rating: 1,
          like_count: 1,
          dislike_count: 1,
          likedBy: 1,
          dislikedBy: 1,
          createdAt: 1,
          "user.username": 1,
          "user.profileImage": 1,
          "user._id": 1,
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    // Đếm tổng số books hợp lệ
    const totalBooksResult = await Book.aggregate([
      { $match: matchFilter },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $match: {
          "user.0": { $exists: true },
        },
      },
      { $count: "total" },
    ]);

    const totalBooks = totalBooksResult[0]?.total || 0;

    res.send({
      books,
      currentPage: page,
      totalBooks,
      totalPages: Math.ceil(totalBooks / limit),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Tính năng Get hết review sách của User đó - và hiển thị lên profile (giống hiển thị bài đăng)
router.get("/user", protectRoute, async (req, res) => {
  try {
    const books = await Book.find({ user: req.user._id }).sort({
      createdAt: -1,
    });
    res.json(books);
  } catch (error) {
    console.error("Get user books error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Update (về bản chất - Put update toàn bộ, Patch update 1 phần)
router.patch("/:id", protectRoute, async (req, res) => {
  try {
    const { title, caption, rating, image, author, published_year, genre } =
      req.body;

    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ message: "Book not found" });

    // Check người sửa có phải người viết Sách không
    if (book.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Cập nhật các thông tin văn bản
    if (title !== undefined) book.title = title;
    if (caption !== undefined) book.caption = caption;
    if (rating !== undefined) book.rating = rating;
    if (author !== undefined) book.author = author;
    if (published_year !== undefined) book.published_year = published_year;
    if (genre !== undefined) book.genre = genre;

    // Nếu có hình ảnh mới, xử lý xóa hình ảnh cũ và upload hình mới
    if (image !== undefined) {
      // Xóa ảnh cũ nếu có
      if (book.image && book.image.includes("cloudinary")) {
        try {
          const parts = book.image.split("/");
          const oldPublicId = parts
            .slice(parts.indexOf("upload") + 2)
            .join("/")
            .split(".")[0];
          await cloudinary.uploader.destroy(oldPublicId);
          console.log("Đã xóa ảnh cũ: ", oldPublicId);
        } catch (deleteError) {
          console.log("Lỗi xóa ảnh cũ:", deleteError);
          // Tiếp tục xử lý dù có lỗi khi xóa ảnh cũ
        }
      }

      // Tạo tên ảnh duy nhất với timestamp và ID sách
      const uniqueFilename = `${book._id}_${Date.now()}`;

      // Upload ảnh mới với tên duy nhất
      const uploadResponse = await cloudinary.uploader.upload(image, {
        folder: "Book_Forum/Book_Review",
        public_id: uniqueFilename, // Đặt tên duy nhất cho ảnh
      });

      book.image = uploadResponse.secure_url;
    }

    await book.save();
    res
      .status(200)
      .json({ message: "Book updated successfully", updatedBook: book });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Delete spec book
router.delete("/:id", protectRoute, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book)
      return res.status(404).json({
        message: "Book not found",
      });

    // Check người xóa có phải người viết Sách không
    if (book.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // "https://res.cloudinary.com/de1rm4uto/image/upload/v1741568358/Book_Forum/Book_Review/your_image_unique_id.png"
    const parts = book.image.split("/"); // cắt ra thành các phần từ dấu "/"

    const publicIdWithVersionAndExtension = parts
      .slice(parts.indexOf("upload") + 2)
      .join("/"); //bắt đầu đi từ index "upload" trong đoạn parts, và bỏ 2 phần tử đầu là upload và id và nối lại các phần còn lại
    console.log(
      "Public ID with version and extension:",
      publicIdWithVersionAndExtension
    );
    // Và join laị sẽ được: "Book_Forum/Book_Review/your_image_unique_id.png"

    const publicId = publicIdWithVersionAndExtension.split(".")[0];
    // Tách ra sẽ được "Book_Forum/Book_Review/your_image_unique_id"

    console.log("Extracted Public ID for Cloudinary deletion:", publicId);

    await cloudinary.uploader.destroy(publicId);
    console.log("Image deleted from Cloudinary successfully.");

    await Comment.deleteMany({ book: req.params.id });
    // Nếu đó là user đã review sách -> thực hiện xóa trên MongoDB
    await book.deleteOne();
    res.json({ message: "Book deleted successfully" });

    // ví dụ đường dẫn ảnh https://res.cloudinary.com/de1rm4uto/image/upload/v1741568358/qyup61vejflxxw8igvi0.png
    // Delete ảnh của Cloudinary
    // if (book.image && book.image.includes("cloudinary") ) {
    //     try {
    //         const publicId = book.image.split("/").pop().split(".")[0]; //tách đường link lấy qyup61vejflxxw8igvi0.png --> và lấy vị trí [0] tức lấy ảnh
    //         await cloudinary.ploader.destroy(publicId);
    //     } catch (deleteError) {
    //         console.log("Error deleting image from cloudinary", deleteError);
    //     }
    // }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Create comment for a book
router.post("/:bookId/comments", protectRoute, async (req, res) => {
  try {
    const { text } = req.body;
    const { bookId } = req.params;
    const io = req.io;
    const currentUser = req.user;

    if (!text || text.trim() === "") {
      return res.status(400).json({ message: "Comment text is required" });
    }

    // Validate bookId
    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      return res.status(400).json({ message: "Invalid book ID format" });
    }

    // Check if book exists
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    const newComment = new Comment({
      text: text.trim(),
      user: req.user._id,
      book: bookId,
    });

    await newComment.save();

    // Populate user info before sending response
    await newComment.populate("user", "username profileImage _id");
    if (io) {
      io.to(bookId.toString()).emit("newComment", newComment.toJSON());
      // Kiểm tra io có tồn tại không
      console.log(
        `Emitted 'newComment' to room ${bookId} for comment ${newComment._id}`
      );
    } else {
      console.warn(
        "Socket.io instance (req.io) not found. Cannot emit 'newComment'."
      );
    }
    // Gửi newComment đã populate và transform
    if (book.user.toString() !== currentUser._id.toString()) {
      const notificationMessage = `${currentUser.username} đã bình luận về sách "${book.title}".`;
      // Link đến comment cụ thể có thể phức tạp, tạm thời link đến sách
      const notificationLink = `/books/${bookId}?commentId=${newComment._id}`; // Ví dụ link
      await createAndSendNotification(
        io,
        book.user, // Người nhận là chủ sở hữu sách
        currentUser._id,
        "new_comment",
        notificationMessage,
        notificationLink,
        "Comment", // relatedItemType là Comment
        newComment._id // relatedItemId là ID của comment mới
      );
    }
    res.status(201).json(newComment.toJSON());
  } catch (error) {
    console.error("Create comment error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get comments for a book
router.get("/:bookId/comments", protectRoute, async (req, res) => {
  try {
    const { bookId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Validate bookId
    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      return res.status(400).json({ message: "Invalid book ID format" });
    }

    // Check if book exists
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    const comments = await Comment.find({ book: bookId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "username profileImage _id");

    // THÊM MỚI: Filter out comments with null users (deleted users)
    const validComments = comments.filter((comment) => comment.user !== null);

    const totalComments = await Comment.countDocuments({
      book: bookId,
      user: { $ne: null }, // Chỉ đếm comments có user hợp lệ
    });

    res.json({
      comments: validComments, // Trả về comments có user hợp lệ
      currentPage: page,
      totalComments,
      totalPages: Math.ceil(totalComments / limit),
    });
  } catch (error) {
    console.error("Get comments error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/:bookId/comments/:commentId", protectRoute, async (req, res) => {
  try {
    const { text } = req.body;
    const { bookId, commentId } = req.params;
    const io = req.io;

    if (!text || text.trim() === "") {
      return res.status(400).json({ message: "Comment text cannot be empty." });
    }

    const comment = await Comment.findById(commentId);

    if (!comment) {
      return res.status(404).json({ message: "Comment not found." });
    }
    if (comment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: "Forbidden: You are not authorized to edit this comment.",
      });
    }
    if (comment.book.toString() !== bookId) {
      return res.status(400).json({
        message: "Bad request: Comment does not belong to this book.",
      });
    }

    comment.text = text;
    await comment.save();

    const populatedComment = await Comment.findById(comment._id).populate(
      "user",
      "username profileImage"
    );
    if (io) {
      io.to(bookId.toString()).emit(
        "commentUpdated",
        populatedComment.toJSON()
      );
      console.log(
        `Emitted 'commentUpdated' to room ${bookId} for comment ${populatedComment._id}`
      );
    } else {
      console.warn(
        "Socket.io instance (req.io) not found. Cannot emit 'commentUpdated'."
      );
    }
    res.json(populatedComment);
  } catch (error) {
    console.error("Update comment error:", error);
    if (error.kind === "ObjectId") {
      return res
        .status(404)
        .json({ message: "Comment not found or invalid ID." });
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

router.delete(
  "/:bookId/comments/:commentId",
  protectRoute,
  async (req, res) => {
    try {
      const { bookId, commentId } = req.params;
      const io = req.io;

      const comment = await Comment.findById(commentId);
      if (io) {
        // Gửi ID của comment đã xóa và bookId để client biết xóa comment nào khỏi sách nào
        io.to(bookId.toString()).emit("commentDeleted", { commentId, bookId });
        console.log(
          `Emitted 'commentDeleted' to room ${bookId} for comment ${commentId}`
        );
      } else {
        console.warn(
          "Socket.io instance (req.io) not found. Cannot emit 'commentDeleted'."
        );
      }
      if (!comment) {
        return res.status(404).json({ message: "Comment not found." });
      }
      if (comment.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          message: "Forbidden: You are not authorized to delete this comment.",
        });
      }
      if (comment.book.toString() !== bookId) {
        return res.status(400).json({
          message: "Bad request: Comment does not belong to this book.",
        });
      }

      await Comment.findByIdAndDelete(commentId);

      res.json({ message: "Comment deleted successfully." });
    } catch (error) {
      console.error("Delete comment error:", error);
      if (error.kind === "ObjectId") {
        return res
          .status(404)
          .json({ message: "Comment not found or invalid ID." });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// Tính năng like và dislike O day
// chỉ cần check authenticate là like được - make sure chỉ like hoặc dislike
const emitBookUpdate = (req, bookDocument) => {
  const io = req.io;
  if (io && bookDocument) {
    const bookUpdateData = {
      _id: bookDocument._id,
      like_count: bookDocument.like_count,
      dislike_count: bookDocument.dislike_count,
      likedBy: bookDocument.likedBy,
      dislikedBy: bookDocument.dislikedBy,
    };
    // Emit đến room của sách này
    io.to(bookDocument._id.toString()).emit(
      "bookInteractionUpdate",
      bookUpdateData
    );
    console.log(
      `Emitted 'bookInteractionUpdate' to room ${bookDocument._id.toString()} for book ${
        bookDocument._id
      }`
    );
  } else if (!io) {
    console.warn(
      "Socket.io instance (req.io) not found. Cannot emit 'bookInteractionUpdate'."
    );
  }
};

router.put("/:id/like", protectRoute, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ message: "Book not found" });

    const currentUser = req.user; // <--- LẤY currentUser ---
    const userId = currentUser._id; // <--- SỬ DỤNG currentUser._id ---
    const io = req.io; // <--- LẤY io ---
    let updated = false;
    if (!book.likedBy.includes(userId)) {
      book.likedBy.push(userId);
      book.like_count += 1;
      updated = true;
      // If user previously disliked, remove from dislikedBy and decrement dislike_count
      if (book.dislikedBy.includes(userId)) {
        book.dislikedBy.pull(userId);
        book.dislike_count -= 1;
      }
      if (updated && book.user.toString() !== userId.toString()) {
        // Chỉ gửi nếu có thay đổi và không phải tự like
        const notificationMessage = `${currentUser.username} đã thích sách "${book.title}".`;
        const notificationLink = `/books/${book._id}`;
        await createAndSendNotification(
          io,
          book.user, // Người nhận là chủ sở hữu sách
          userId, // Người gửi là currentUser
          "new_like_on_book",
          notificationMessage,
          notificationLink,
          "Book", // relatedItemType là Book
          book._id // relatedItemId là ID của sách được like
        );
      }
    }

    if (updated) {
      await book.save();
      emitBookUpdate(req, book); // <--- THÊM: Emit sự kiện
    }
    res.status(200).json(book);
  } catch (error) {
    console.error("Like book error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Like - tham khao PATCH
// router.patch("/:id/like", protectRoute, async (req, res) => {
//     try {
//         const userId = req.user._id;

//         // findOneAndUpdate là build in của Mongoose, dùng để tìm và cập nhật 1 phần trong document
//         const book = await Book.findOneAndUpdate(
//             { _id: req.params.id, "likedBy": { $ne: userId } },  // Bước này Query sách - và là điều kiện and = if có sách && userid not equal ở trong array likedBy --> thì cho like -> tránh case like nhiều lần.
//             {
//                 $push: { likedBy: userId }, // Thêm user vào array likeBy
//                 $inc: { like_count: 1 },    // Tăng thêm vào like_count
//                 $pull: { dislikedBy: userId }, // Xóa user khỏi dislikedBy nếu có -> tránh trường hợp vừa like vừa dislike
//                 $inc: { dislike_count: -1 } // Giảm dislike_count nếu user có trong dislikedBy
//             },
//             { new: true } // Chắc chắn  document được updateupdate
//         );

//         if (!book) {
//             return res.status(404).json({ message: "Book not found or already liked" });
//         }

//         res.status(200).json(book);
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: "Internal server error" });
//     }
// });

// Hủy nút like
router.put("/:id/unlike", protectRoute, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ message: "Book not found" });

    const userId = req.user._id;
    let updated = false;
    if (book.likedBy.includes(userId)) {
      book.likedBy.pull(userId);
      book.like_count -= 1;
      updated = true;
    }
    if (updated) {
      await book.save();
      emitBookUpdate(req, book);
    }
    res.status(200).json(book);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Dislike
router.put("/:id/dislike", protectRoute, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ message: "Book not found" });

    const userId = req.user._id;
    let updated = false;
    if (!book.dislikedBy.includes(userId)) {
      book.dislikedBy.push(userId);
      book.dislike_count += 1;
      updated = true;
      // If user previously liked, remove from likedBy and decrement like_count
      if (book.likedBy.includes(userId)) {
        book.likedBy.pull(userId);
        book.like_count -= 1;
      }
    }
    if (updated) {
      await book.save();
      emitBookUpdate(req, book);
    }
    res.status(200).json(book);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Hủy nút Dislike
router.put("/:id/remove-dislike", protectRoute, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ message: "Book not found" });

    const userId = req.user._id;
    let updated = false;
    if (book.dislikedBy.includes(userId)) {
      book.dislikedBy.pull(userId);
      book.dislike_count -= 1;
      updated = true;
    }
    if (updated) {
      await book.save();
      emitBookUpdate(req, book);
    }
    res.status(200).json(book);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Di chuyển route search lên trước route /:id
router.get("/search", protectRoute, async (req, res) => {
  try {
    const searchQuery = req.query.q;
    if (!searchQuery) {
      return res.status(200).json([]);
    }

    // Tìm sách theo tiêu đề, tác giả
    const books = await Book.find({
      $or: [
        { title: { $regex: searchQuery, $options: "i" } },
        { author: { $regex: searchQuery, $options: "i" } },
      ],
    }).populate("user", "username profileImage _id");

    res.status(200).json(books);
  } catch (error) {
    console.error("Error searching books:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Sau đó mới là route lấy chi tiết sách theo id
router.get("/:id", protectRoute, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).populate(
      "user",
      "username profileImage createdAt"
    );

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    res.json(book);
  } catch (error) {
    console.error("Get book details error:", error);
    if (error.kind === "ObjectId") {
      return res.status(400).json({ message: "Invalid book ID format" });
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
