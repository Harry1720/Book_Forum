# MERN Stack Book Forum - User Application and Administration Website

A full-stack book forum application using MERN stack (MongoDB, Express.js, React Native, Node.js) featuring real-time communication, admin panel, and mobile support, with the help of **Claude Sonnet** and some other AI tools.

## 🚀 Features
### 📱 Mobile App (React Native/Expo)
- **User Authentication**: Login, register, password reset with email verification
- **Book Management**: Create, edit, delete books
- **Social Features**: View, like, dislike, comment on books
- **Search & Filter**: Advanced search with filtering by title or author
- **Notifications**: Real-time push notifications for interactions
- **Multilingual Support**: English and Vietnamese language support
- **Report System**: Report inappropriate content, comments or users
- **Profile Management**: Edit profile, change avatar, manage account

### 🎛️ Admin Panel (React.js)
- **Dashboard**: Overview of users, books, reports statistics
- **User Management**: View, edit, suspend, delete user accounts
- **Content Moderation**: Review and manage reported content
- **Book Management**: Monitor and manage all book posts
- **Genre Management**: Add, edit, hide/show book genres

### 🖥️ Backend (Node.js/Express)
- **RESTful API**: Comprehensive API endpoints
- **Real-time Communication**: Socket.IO server for live updates
- **Authentication**: JWT-based secure authentication
- **File Upload**: Cloudinary integration for image management
- **Email Service**: Automated email notifications
- **Database**: MongoDB with Mongoose ODM
- **Report System**: Complete content moderation workflow

## 🛠️ Tech Stack
- **Frontend (Mobile):** React Native, Expo, Zustand, Async Storage
- **Frontend (Admin Panel):** React.js, Material-UI (MUI), Vite
- **Backend**:
    - **Node.js** - Runtime environment
    - **Express.js** - Web application framework
    - **MongoDB** - NoSQL database
    - **Mongoose** - MongoDB object modeling
    - **Socket.IO** - Real-time bidirectional communication
    - **JWT** - JSON Web Tokens for authentication
    - **Bcrypt** - Password hashing
    - **Cloudinary** - Cloud image storage and management
    - **Nodemailer** - Email sending service
    - **Multer** - File upload middleware
    - **CORS** - Cross-origin resource sharing
- **Development Tools:**
    - **ESLint** - Code linting
    - **Nodemon** - Development server auto-restart
    - **dotenv** - Environment variable management

## Some pictures of the project
<img src="pics\Picture1.png" width="200"/>
<img src="pics\Picture3.png"/>
<img src="pics\Pic.png"/>
<img src="pics\Picture6.png"/>
<img src="pics\Picture7.png"/>

## 🚀 How to run project manually
**Note:** Expo CLI works best on Windows OS.

### 🔧 Run Backend Server
```bash
cd backend
npm install
npm run dev
```

### 📡 Run Socket Server
```bash
cd socket
npm install
npm run dev
```

### 📱 Run Mobile App
```bash
cd FE
npm install
npm install socket.io-client
npx expo
```
**Note:** 
- ```npm install socket.io-client``` Install this if socket-related errors occur.
- Update API endpoint: Edit in ```FE/constants/api.js``` and replace the base URL with your local IP address.
- Use your phone if the Expo App has been installed, or use Android Studio instead.

### 🖥️ Run Admin Web
```bash
cd admin
npm install
npm run dev
```

## 🌐 How to run project without configuring (Deployments)
- **Admin website:** Using **Vercel** & **Jamstack** 
    - Access via https://mobile-ts-react-native.vercel.app
- **APK app:** using **Render** 
    - Download ```app-book-forum.apk``` in this repository


## 👥 User Roles

| Role    | Access via Mobile | Access via Admin Web |
|---------|------------------ |----------------------|
| Admin   | ✅               | ✅                   |
| User    | ✅               | ❌                   |
| Guest   | ✅               | ❌                   |

## 🧑‍💻 Contributers
|Members|Position|
|-------|--------|
|Trần Đăng Nam |Backend|
|Nguyễn Hoàng Gia Huy|Backend|
|Huỳnh Nguyễn Quốc Bảo|Frontend|
|Phạm Vũ Minh Huy|Frontend|
|Phan Ngọc Thạch|Frontend|

## 🔁 API Response Standard & Workflow
### ✅ Commit Message Convention

| Type       | Description                             |
|------------|-----------------------------------------|
| `feat:`    | New feature                             |
| `fix:`     | Bug fix                                 |
| `refactor:`| Code restructuring (no feature changes) |
| `docs:`    | Documentation updates                   |
| `chore:`   | Routine tasks (no logic impact)         |
| `style:`   | UI/CSS changes                          |
| `perf:`    | Performance improvements                |
| `vendor:`  | Dependency/package version updates      |

### 🌿 Branch Naming Convention

- Use lowercase and hyphens. Avoid special characters or uppercase.
- Examples:  
  - `feature/login`  
  - `bugfix/chat-not-loading`

### ✅ Success Response

```json
{
  "success": true,
  "message": "Request processed successfully",
  "data": {
    "id": "12345",
    "name": "abc",
    "email": "abc@example.com"
  },
  "meta": {
    "timestamp": "2024-12-28T15:00:00Z",
    "instance": "/api/v1/auth/login"
  }
}
```

### ❌ Error Response

```json
{
  "success": false,
  "errors": [
    {
      "code": 1002,
      "message": "Cannot update this record"
    }
  ],
  "meta": {
    "timestamp": "2025-01-26T03:50:52.555Z",
    "instance": "/api/v1/resource/123"
  }
}
```

#### 📌 Field Explanation

| Field     | Description                        |
|-----------|------------------------------------|
| `success` | Boolean indicating request success |
| `message` | Short message (used on frontend)   |
| `data`    | Data payload (on success)          |
| `errors`  | List of error details (on failure) |
| `code`    | Internal error code                |
| `meta`    | Metadata (timestamp, endpoint info)|

## 📊 REST API Status Codes

| Status | Meaning                           |
|--------|-----------------------------------|
| `200`  | OK – Request succeeded            |
| `201`  | Created – New resource added      |
| `400`  | Bad Request – Invalid input       |
| `401`  | Unauthorized – Invalid token      |
| `404`  | Not Found – Resource not found    |
| `500`  | Internal Server Error             |
