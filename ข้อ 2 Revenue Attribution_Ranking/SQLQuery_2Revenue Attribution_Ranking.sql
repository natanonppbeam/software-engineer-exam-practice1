/* =========================================================
   Revenue Attribution & Ranking
   Top 3 Restaurant AOV per Category
   SQL Server
   ========================================================= */

USE Product;
GO


/* =========================================================
   1. DROP TABLE เดิมสำหรับกรณีทดสอบใหม่
   ========================================================= */

DROP TABLE IF EXISTS dbo.[Orders];
DROP TABLE IF EXISTS dbo.Restaurants;
DROP TABLE IF EXISTS dbo.Categories;
GO


/* =========================================================
   2. CREATE TABLE : Categories
   ========================================================= */

CREATE TABLE dbo.Categories
(
    CategoryID INT IDENTITY(1,1) PRIMARY KEY,
    CategoryName NVARCHAR(100) NOT NULL
);
GO


/* =========================================================
   3. CREATE TABLE : Restaurants
   ========================================================= */

CREATE TABLE dbo.Restaurants
(
    RestaurantID INT IDENTITY(1,1) PRIMARY KEY,
    RestaurantName NVARCHAR(200) NOT NULL,
    CategoryID INT NOT NULL,

    CONSTRAINT FK_Restaurants_Categories
        FOREIGN KEY (CategoryID)
        REFERENCES dbo.Categories(CategoryID)
);
GO


/* =========================================================
   4. CREATE TABLE : Orders
   ========================================================= */

CREATE TABLE dbo.[Orders]
(
    OrderID INT IDENTITY(1,1) PRIMARY KEY,
    RestaurantID INT NOT NULL,
    OrderDate DATETIME2 NOT NULL,
    OrderStatus VARCHAR(20) NOT NULL,
    OrderTotal DECIMAL(18,2) NOT NULL,

    CONSTRAINT FK_Orders_Restaurants
        FOREIGN KEY (RestaurantID)
        REFERENCES dbo.Restaurants(RestaurantID)
);
GO


/* =========================================================
   5. INSERT CATEGORY
   ========================================================= */

INSERT INTO dbo.Categories
(
    CategoryName
)
VALUES
    (N'Thai'),
    (N'Japanese'),
    (N'Fast Food'),
    (N'Cafe');
GO


/* =========================================================
   6. INSERT RESTAURANT
   ========================================================= */

INSERT INTO dbo.Restaurants
(
    RestaurantName,
    CategoryID
)
VALUES
    -- Thai
    (N'Bangkok Kitchen', 1),
    (N'Thai Premium', 1),
    (N'Somtum House', 1),
    (N'Thai Street', 1),
    (N'Thai Garden', 1),

    -- Japanese
    (N'Tokyo House', 2),
    (N'Sushi Premium', 2),
    (N'Osaka Kitchen', 2),
    (N'Ramen Station', 2),
    (N'Kyoto Dining', 2),

    -- Fast Food
    (N'Burger Station', 3),
    (N'Chicken Hub', 3),
    (N'Pizza Town', 3),
    (N'Fast Meal', 3),

    -- Cafe
    (N'Coffee Lab', 4),
    (N'Cafe Corner', 4),
    (N'Morning Coffee', 4),
    (N'No Order Cafe', 4);
GO


/* =========================================================
   7. INSERT SAMPLE ORDER
   ใช้เดือนปัจจุบันอัตโนมัติ
   ========================================================= */

DECLARE @CurrentMonth DATE =
    DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1);


/* ---------- Thai ---------- */

INSERT INTO dbo.[Orders]
(
    RestaurantID,
    OrderDate,
    OrderStatus,
    OrderTotal
)
VALUES
    (1, DATEADD(DAY,1,@CurrentMonth), 'delivered', 500),
    (1, DATEADD(DAY,2,@CurrentMonth), 'delivered', 700),
    (1, DATEADD(DAY,3,@CurrentMonth), 'delivered', 600),

    (2, DATEADD(DAY,1,@CurrentMonth), 'delivered', 1000),
    (2, DATEADD(DAY,2,@CurrentMonth), 'delivered', 1200),

    (3, DATEADD(DAY,1,@CurrentMonth), 'delivered', 800),
    (3, DATEADD(DAY,2,@CurrentMonth), 'delivered', 700),

    (4, DATEADD(DAY,1,@CurrentMonth), 'delivered', 300),
    (4, DATEADD(DAY,2,@CurrentMonth), 'delivered', 400),

    -- Cancelled ไม่นับ
    (5, DATEADD(DAY,1,@CurrentMonth), 'cancelled', 5000);


/* ---------- Japanese ---------- */

INSERT INTO dbo.[Orders]
(
    RestaurantID,
    OrderDate,
    OrderStatus,
    OrderTotal
)
VALUES
    (6, DATEADD(DAY,1,@CurrentMonth), 'delivered', 1500),
    (6, DATEADD(DAY,2,@CurrentMonth), 'delivered', 1200),

    (7, DATEADD(DAY,1,@CurrentMonth), 'delivered', 900),
    (7, DATEADD(DAY,2,@CurrentMonth), 'delivered', 1100),

    (8, DATEADD(DAY,1,@CurrentMonth), 'delivered', 700),

    (9, DATEADD(DAY,1,@CurrentMonth), 'delivered', 500),

    -- เดือนที่แล้ว ไม่นับ
    (10, DATEADD(MONTH,-1,@CurrentMonth), 'delivered', 10000);


/* ---------- Fast Food ---------- */

INSERT INTO dbo.[Orders]
(
    RestaurantID,
    OrderDate,
    OrderStatus,
    OrderTotal
)
VALUES
    (11, DATEADD(DAY,1,@CurrentMonth), 'delivered', 600),
    (11, DATEADD(DAY,2,@CurrentMonth), 'delivered', 700),

    (12, DATEADD(DAY,1,@CurrentMonth), 'delivered', 500),

    (13, DATEADD(DAY,1,@CurrentMonth), 'delivered', 800),

    (14, DATEADD(DAY,1,@CurrentMonth), 'delivered', 300);


/* ---------- Cafe ---------- */

INSERT INTO dbo.[Orders]
(
    RestaurantID,
    OrderDate,
    OrderStatus,
    OrderTotal
)
VALUES
    (15, DATEADD(DAY,1,@CurrentMonth), 'delivered', 450),
    (15, DATEADD(DAY,2,@CurrentMonth), 'delivered', 550),

    (16, DATEADD(DAY,1,@CurrentMonth), 'delivered', 350),

    (17, DATEADD(DAY,1,@CurrentMonth), 'delivered', 250);

-- RestaurantID 18 = ไม่มี Order เลย
GO


/* =========================================================
   8. QUERY
   Revenue Attribution & Ranking
   Top 3 AOV ของแต่ละ Category
   ========================================================= */

DECLARE @StartDate DATE =
    DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1);

DECLARE @EndDate DATE =
    DATEADD(MONTH, 1, @StartDate);


WITH RestaurantAOV AS
(
    SELECT
        c.CategoryID,
        c.CategoryName,

        r.RestaurantID,
        r.RestaurantName,

        COUNT(o.OrderID) AS DeliveredOrderCount,

        COALESCE(
            SUM(o.OrderTotal),
            0
        ) AS TotalRevenue,

        COALESCE(
            CAST(SUM(o.OrderTotal) AS DECIMAL(18,2))
            /
            NULLIF(COUNT(o.OrderID), 0),
            0
        ) AS AOV

    FROM dbo.Categories c

    INNER JOIN dbo.Restaurants r
        ON c.CategoryID = r.CategoryID

    LEFT JOIN dbo.[Orders] o
        ON r.RestaurantID = o.RestaurantID

        -- นับเฉพาะ Delivered
        AND o.OrderStatus = 'delivered'

        -- เฉพาะเดือนปัจจุบัน
        AND o.OrderDate >= @StartDate
        AND o.OrderDate < @EndDate

    GROUP BY
        c.CategoryID,
        c.CategoryName,
        r.RestaurantID,
        r.RestaurantName
),


RankedRestaurant AS
(
    SELECT
        CategoryID,
        CategoryName,
        RestaurantID,
        RestaurantName,
        DeliveredOrderCount,
        TotalRevenue,
        AOV,

        ROW_NUMBER() OVER
        (
            PARTITION BY CategoryID
            ORDER BY
                AOV DESC,
                RestaurantID ASC
        ) AS AOVRank

    FROM RestaurantAOV
)


SELECT
    CategoryID,
    CategoryName,

    AOVRank,

    RestaurantID,
    RestaurantName,

    DeliveredOrderCount,

    TotalRevenue,

    CAST(AOV AS DECIMAL(18,2)) AS AOV

FROM RankedRestaurant

WHERE AOVRank <= 3

ORDER BY
    CategoryID,
    AOVRank;