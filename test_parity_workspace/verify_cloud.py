"""
3D Data Engineer - Point Cloud Verification
Đọc và kiểm tra số lượng điểm trong file bowl_sample.ply
"""

import open3d as o3d
import os


def verify_point_cloud(filename: str = "bowl_sample.ply") -> int:
    """
    Đọc file PLY và trả về số lượng điểm
    
    Args:
        filename: Tên file cần kiểm tra
        
    Returns:
        Số lượng điểm trong point cloud
    """
    # Kiểm tra file tồn tại
    if not os.path.exists(filename):
        print(f"[ERROR] File {filename} không tồn tại!")
        return -1
    
    # Đọc file PLY
    pcd = o3d.io.read_point_cloud(filename)
    
    if pcd.is_empty():
        print(f"[ERROR] File {filename} không chứa dữ liệu point cloud!")
        return 0
    
    # Lấy số lượng điểm
    num_points = len(pcd.points)
    
    return num_points


def main():
    """Hàm chính để kiểm tra point cloud"""
    print("=" * 50)
    print("3D Data Engineer - Point Cloud Verification")
    print("=" * 50)
    
    FILENAME = "bowl_sample.ply"
    EXPECTED_POINTS = 10000
    
    print(f"\n[INFO] Đọc file: {FILENAME}")
    
    # Kiểm tra số điểm
    num_points = verify_point_cloud(FILENAME)
    
    if num_points >= 0:
        print(f"\n[RESULT] Số lượng điểm trong file: {num_points}")
        
        # Kiểm tra khớp với expected
        if num_points == EXPECTED_POINTS:
            print(f"[✓ PASS] Số điểm khớp chính xác với {EXPECTED_POINTS} điểm!")
        else:
            print(f"[✗ FAIL] Số điểm không khớp! Expected: {EXPECTED_POINTS}, Got: {num_points}")
        
        # Đọc thêm thông tin
        pcd = o3d.io.read_point_cloud(FILENAME)
        points = pcd.points
        
        print(f"\n[INFO] Thông tin bổ sung:")
        print(f"       - Số điểm: {len(points)}")
        
        # Chuyển sang numpy để tính range
        points_array = np.asarray(points)
        print(f"       - X range: [{points_array[:, 0].min():.4f}, {points_array[:, 0].max():.4f}]")
        print(f"       - Y range: [{points_array[:, 1].min():.4f}, {points_array[:, 1].max():.4f}]")
        print(f"       - Z range: [{points_array[:, 2].min():.4f}, {points_array[:, 2].max():.4f}]")
    
    print("\n" + "=" * 50)


if __name__ == "__main__":
    import numpy as np
    main()