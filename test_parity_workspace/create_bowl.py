"""
3D Data Engineer - Bowl Point Cloud Generator
Tạo point cloud có hình dáng cái bát (3D paraboloid: z = x^2 + y^2)
"""

import numpy as np
import open3d as o3d


def create_bowl_point_cloud(num_points: int = 10000, radius: float = 1.0) -> np.ndarray:
    """
    Tạo point cloud hình bát sử dụng phương trình paraboloid z = x^2 + y^2
    
    Args:
        num_points: Số lượng điểm cần tạo
        radius: Bán kính tối đa của bát
        
    Returns:
        numpy array với shape (num_points, 3) chứa tọa độ 3D
    """
    # Sử dụng phân bố đều trong không gian 2D rồi ánh xạ sang 3D
    # Để có phân bố đều trên bề mặt paraboloid, dùng tọa độ cực
    
    # Tạo mảng r với phân bố căn bậc 2 để có mật độ đều hơn
    r = np.sqrt(np.random.uniform(0, 1, num_points)) * radius
    theta = np.random.uniform(0, 2 * np.pi, num_points)
    
    # Chuyển đổi tọa độ cực sang Descartes
    x = r * np.cos(theta)
    y = r * np.sin(theta)
    z = x**2 + y**2  # Phương trình paraboloid
    
    # Tạo array 3D
    points = np.column_stack((x, y, z))
    
    return points


def save_point_cloud(points: np.ndarray, filename: str = "bowl_sample.ply") -> None:
    """
    Lưu point cloud ra file PLY sử dụng Open3D
    
    Args:
        points: numpy array shape (N, 3)
        filename: Tên file output
    """
    # Tạo Open3D PointCloud object
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(points)
    
    # Lưu ra file PLY
    o3d.io.write_point_cloud(filename, pcd)
    print(f"✓ Đã lưu {len(points)} điểm vào file {filename}")


def main():
    """Hàm chính để tạo và lưu bowl point cloud"""
    print("=" * 50)
    print("3D Data Engineer - Bowl Point Cloud Generator")
    print("=" * 50)
    
    # Thông số
    NUM_POINTS = 10000
    RADIUS = 1.0
    OUTPUT_FILE = "bowl_sample.ply"
    
    print(f"\n[INFO] Tạo {NUM_POINTS} điểm với hình dáng paraboloid z = x^2 + y^2")
    print(f"[INFO] Bán kính: {RADIUS}")
    
    # Tạo point cloud
    points = create_bowl_point_cloud(num_points=NUM_POINTS, radius=RADIUS)
    
    # In thông tin thống kê
    print(f"\n[INFO] Point cloud đã được tạo:")
    print(f"       - Số điểm: {len(points)}")
    print(f"       - X range: [{points[:, 0].min():.4f}, {points[:, 0].max():.4f}]")
    print(f"       - Y range: [{points[:, 1].min():.4f}, {points[:, 1].max():.4f}]")
    print(f"       - Z range: [{points[:, 2].min():.4f}, {points[:, 2].max():.4f}]")
    
    # Lưu file
    save_point_cloud(points, OUTPUT_FILE)
    
    print("\n" + "=" * 50)
    print("Hoàn tất! Chạy verify_cloud.py để kiểm tra.")
    print("=" * 50)


if __name__ == "__main__":
    main()