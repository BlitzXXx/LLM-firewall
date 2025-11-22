"""
Simple test client for the Analyzer gRPC service
"""

import grpc
from src import firewall_pb2
from src import firewall_pb2_grpc


def test_health_check():
    """Test the HealthCheck RPC"""
    print("Testing HealthCheck RPC...")

    # Create channel
    with grpc.insecure_channel("localhost:50051") as channel:
        # Create stub
        stub = firewall_pb2_grpc.FirewallServiceStub(channel)

        # Make request
        request = firewall_pb2.HealthCheckRequest(service="test")
        response = stub.HealthCheck(request)

        print(f"  Status: {response.status}")
        print(f"  Version: {response.version}")
        print(f"  Uptime: {response.uptime_seconds}s")
        print("  ✅ HealthCheck passed\n")


def test_check_content():
    """Test the CheckContent RPC"""
    print("Testing CheckContent RPC...")

    # Create channel
    with grpc.insecure_channel("localhost:50051") as channel:
        # Create stub
        stub = firewall_pb2_grpc.FirewallServiceStub(channel)

        # Make request
        request = firewall_pb2.CheckContentRequest(
            content="This is a test message",
            request_id="test-request-123",
            metadata={"client_ip": "127.0.0.1"},
        )
        response = stub.CheckContent(request)

        print(f"  Is Safe: {response.is_safe}")
        print(f"  Redacted Text: {response.redacted_text}")
        print(f"  Detected Issues: {len(response.detected_issues)}")
        print(f"  Confidence Score: {response.confidence_score}")
        print(f"  Request ID: {response.request_id}")
        print("  ✅ CheckContent passed\n")


if __name__ == "__main__":
    print("=" * 60)
    print("Testing Analyzer gRPC Service")
    print("=" * 60 + "\n")

    try:
        test_health_check()
        test_check_content()
        print("=" * 60)
        print("All tests passed! ✅")
        print("=" * 60)
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback

        traceback.print_exc()
